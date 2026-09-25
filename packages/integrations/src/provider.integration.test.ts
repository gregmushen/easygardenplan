import { describe, expect, it } from "vitest";
import { createElement } from "react";

import { readStagingProviderVariables } from "./provider-staging-config.js";
import { StripeBillingAdapter } from "./payments/adapters/stripe.js";
import { createEmailService } from "./email/index.js";
import { ExaResearchAdapter } from "./exa.js";
import { GeoapifyGeocoder } from "./geoapify.js";
import { NwsAdapter } from "./nws.js";

const enabled = process.env.TRESTLE_PROVIDER_INTEGRATION_TESTS === "1";
const provider = enabled ? describe : describe.skip;

provider("protected staging providers", () => {
  it("authenticates to the garden data providers with bounded representative requests", async () => {
    const geoapify = process.env.GEOAPIFY_API_KEY;
    const maptiler = process.env.MAPTILER_PUBLIC_KEY;
    const exa = process.env.EXA_API_KEY;
    const nwsUserAgent = process.env.NWS_USER_AGENT;
    expect(geoapify).toBeTruthy(); expect(maptiler).toBeTruthy(); expect(exa).toBeTruthy(); expect(nwsUserAgent).toContain("easygardenplan.com");
    expect(process.env.MAPTILER_BUILD_KEY).toBe(maptiler);

    const candidates = await new GeoapifyGeocoder({ apiKey: geoapify! }).forward({ text: "1600 Pennsylvania Avenue NW, Washington, DC", limit: 1 });
    expect(candidates[0]).toMatchObject({ provider: "geoapify" });

    for (const style of ["streets-v2", "satellite"]) {
      const response = await fetch(`https://api.maptiler.com/maps/${style}/style.json?key=${encodeURIComponent(maptiler!)}`);
      expect(response.ok, `MapTiler ${style} returned HTTP ${response.status}`).toBe(true);
      await expect(response.json()).resolves.toMatchObject({ version: 8, sources: expect.any(Object) });
    }

    const research = await new ExaResearchAdapter(exa!).search({ cropNames: ["tomato"], methods: ["direct_sow"], regionClasses: ["mid_atlantic"], ruleTypes: ["spacing"] });
    expect(research.requestFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(research.candidates.length).toBeGreaterThan(0);

    const nws = new NwsAdapter({ userAgent: nwsUserAgent! });
    const [forecast, alerts] = await Promise.all([nws.forecast(38.8977, -77.0365), nws.alerts(38.8977, -77.0365)]);
    expect(forecast.intervals.length).toBeGreaterThan(0);
    expect(Array.isArray(alerts)).toBe(true);
  });

  it("authenticates to Resend with the declared staging recipient redirect", async () => {
    const key = process.env.RESEND_API_KEY;
    const staging = await readStagingProviderVariables();
    const redirect = staging.EMAIL_STAGING_REDIRECT;
    expect(key?.startsWith("re_")).toBe(true);
    expect(staging.EMAIL_DELIVERY_MODE).toBe("resend");
    expect(staging.EMAIL_FROM).not.toBe("CHANGE_ME");
    expect(redirect).toMatch(/^[^@\s]+@[^@\s]+$/u);
    const response = await fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${key}` } });
    expect(response.ok, `Resend returned HTTP ${response.status}`).toBe(true);
  });

  it("sends one safely redirected staging message across an idempotent retry", async () => {
    const key = process.env.RESEND_API_KEY;
    const staging = await readStagingProviderVariables();
    expect(key).toMatch(/^re_/u);
    expect(staging.EMAIL_DELIVERY_MODE).toBe("resend");
    expect(staging.EMAIL_STAGING_REDIRECT).toMatch(/^[^@\s]+@[^@\s]+$/u);
    const service = createEmailService({
      mode: "resend", environment: "staging", resendApiKey: key!, from: staging.EMAIL_FROM!,
      stagingRedirect: staging.EMAIL_STAGING_REDIRECT!,
    });
    const message = {
      to: `trestle-provider-${crypto.randomUUID()}@example.test`,
      subject: "Trestle provider verification",
      template: { name: "ProviderVerification", props: {}, render: () => createElement("p", null, "Trestle staging provider verification") },
    };
    const options = { idempotencyKey: `provider-verification:${crypto.randomUUID()}` };
    const first = await service.send(message, options);
    const retry = await service.send(message, options);
    expect(first.id.length).toBeGreaterThan(0);
    expect(retry.id).toBe(first.id);
    const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(first.id)}`, { headers: { authorization: `Bearer ${key}` } });
    expect(response.ok, `Resend email inspection returned HTTP ${response.status}`).toBe(true);
    const accepted = await response.json() as { to?: string[]; subject?: string };
    expect(accepted.to).toEqual([staging.EMAIL_STAGING_REDIRECT]);
    expect(accepted.subject).toBe(`[STAGING → ${message.to}] ${message.subject}`);
  });

  it("authenticates to Stripe test mode without creating resources", async () => {
    const key = process.env.STRIPE_SECRET_KEY;
    const staging = await readStagingProviderVariables();
    expect(key).toMatch(/^(?:sk|rk)_test_[A-Za-z0-9_]+$/u);
    expect(staging.STRIPE_MODE).toBe("test");
    expect(staging.STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_")).toBe(true);
    for (const resource of ["prices", "products", "subscriptions", "checkout/sessions"]) {
      const response = await fetch(`https://api.stripe.com/v1/${resource}?limit=1`, { headers: { authorization: `Bearer ${key}` } });
      expect(response.ok, `Stripe ${resource} returned HTTP ${response.status}`).toBe(true);
      const result = await response.json() as { object?: string; data?: unknown };
      expect(result.object).toBe("list");
      expect(Array.isArray(result.data)).toBe(true);
    }
  });

  it("creates one test-mode Checkout session across an idempotent retry", async () => {
    const key = process.env.STRIPE_SECRET_KEY;
    const staging = await readStagingProviderVariables();
    expect(key).toMatch(/^(?:sk|rk)_test_[A-Za-z0-9_]+$/u);
    expect(staging.STRIPE_MODE).toBe("test");
    const prices = JSON.parse(staging.STRIPE_PRICES ?? "{}") as Record<string, string>;
    expect(prices.pro).toMatch(/^price_[A-Za-z0-9]+$/u);
    expect(staging.BILLING_RETURN_URL).toMatch(/^https:\/\//u);
    const adapter = new StripeBillingAdapter({
      secretKey: key!, prices, returnUrl: staging.BILLING_RETURN_URL!,
      repository: { get: async () => null, put: async () => undefined },
    });
    const input = { organizationId: `provider-gate-${crypto.randomUUID()}`, plan: "pro", requestId: crypto.randomUUID() };
    const first = await adapter.createCheckoutSession(input);
    const retry = await adapter.createCheckoutSession(input);
    expect(first.id).toMatch(/^cs_test_/u);
    expect(first.url).toMatch(/^https:\/\/checkout\.stripe\.com\//u);
    expect(retry.id).toBe(first.id);
  });
});
