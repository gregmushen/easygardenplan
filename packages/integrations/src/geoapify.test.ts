import { describe, expect, it, vi } from "vitest";
import { FixtureGeocoder, GeoapifyError, GeoapifyGeocoder } from "./geoapify.js";

describe("Geoapify adapter", () => {
  it("normalizes candidates and keeps the key out of returned data", async () => {
    const providerFetch = vi.fn(async (request: URL | RequestInfo) => {
      const url = new URL(String(request));
      expect(url.searchParams.get("filter")).toBe("countrycode:us");
      expect(url.searchParams.get("apiKey")).toBe("secret-fixture");
      return new Response(JSON.stringify({ results: [{ place_id: "place-1", formatted: "Portland, OR", lat: 45.52, lon: -122.68, result_type: "city", rank: { confidence: 0.95 }, timezone: { name: "America/Los_Angeles" }, country_code: "us", state_code: "OR" }] }), { status: 200 });
    });
    const result = await new GeoapifyGeocoder({ apiKey: "secret-fixture", fetch: providerFetch }).forward({ text: "Portland, OR", limit: 3 });
    expect(result).toEqual([expect.objectContaining({ providerPlaceId: "place-1", timezone: "America/Los_Angeles", confidence: 0.95, regionIds: ["us", "us-or"] })]);
    expect(JSON.stringify(result)).not.toContain("secret-fixture");
  });

  it("turns rate limiting into a retryable provider-neutral error", async () => {
    const geocoder = new GeoapifyGeocoder({ apiKey: "fixture", fetch: async () => new Response("", { status: 429 }) });
    await expect(geocoder.forward({ text: "Juneau, Alaska" })).rejects.toEqual(expect.objectContaining<Partial<GeoapifyError>>({ code: "rate_limited", retryable: true }));
  });

  it("supports deterministic no-result and manual-fallback fixtures", async () => {
    expect(await new FixtureGeocoder([]).forward({ text: "unknown place" })).toEqual([]);
  });
});
