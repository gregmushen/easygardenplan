import { describe, expect, it } from "vitest";
import { InMemoryBillingProjectionRepository, LocalBillingAdapter } from "@easygardenplan/integrations";
import { Entitlements, planEntitlements } from "./index.js";

describe("local billing and entitlements", () => {
  it("activates, changes, fails, resumes, and cancels deterministically", async () => {
    const repository = new InMemoryBillingProjectionRepository();
    const billing = new LocalBillingAdapter(repository, planEntitlements);
    await billing.activate({ organizationId: "org-1", plan: "free" });
    expect(new Entitlements(new Set((await billing.getSubscription("org-1"))!.entitlements)).has("garden.planning")).toBe(true);
    await billing.changePlan({ organizationId: "org-1", plan: "pro", commandId: "change-1" });
    expect((await billing.getSubscription("org-1"))!.entitlements).toContain("weather.monitoring");
    await billing.failPayment({ organizationId: "org-1" });
    expect((await billing.getSubscription("org-1"))!.status).toBe("past_due");
    await billing.resumeSubscription({ organizationId: "org-1", commandId: "resume-1" });
    await billing.cancelSubscription({ organizationId: "org-1", commandId: "cancel-1" });
    expect(await billing.getSubscription("org-1")).toMatchObject({ status: "cancelled", entitlements: [] });
  });

  it("explains plan inheritance and time-bounded overrides", () => {
    const now = new Date("2026-09-22T12:00:00.000Z");
    const entitlements = new Entitlements(new Set(["garden.planning", "weather.monitoring"]), { plan: "pro", planVersion: 1, now, overrides: [{ code: "weather.monitoring", enabled: false, reason: "account review", authorId: "operator-1", effectiveAt: new Date("2026-09-22T11:00:00.000Z") }] });
    expect(entitlements.has("weather.monitoring")).toBe(false);
    expect(entitlements.resolve("garden.planning")).toMatchObject({ enabled: true, source: "plan", inheritedFrom: "pro@1" });
  });

  it("never exposes an override's internal reason or author in customer-visible provenance", () => {
    const now = new Date("2026-09-22T12:00:00.000Z");
    const entitlements = new Entitlements(new Set(["garden.planning"]), { plan: "pro", planVersion: 1, now, overrides: [
      { code: "weather.monitoring", enabled: true, reason: "churn risk: CFO escalation, 40% discount", authorId: "operator-7", effectiveAt: new Date("2026-09-22T11:00:00.000Z") },
    ] });
    expect(entitlements.resolve("weather.monitoring")).toMatchObject({ enabled: true, source: "override", inheritedFrom: "contract" });
    const customerView = JSON.stringify(entitlements.explain());
    expect(customerView).not.toMatch(/churn|CFO|discount|operator-7/u);
  });
});
