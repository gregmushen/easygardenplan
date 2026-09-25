import { describe, expect, it } from "vitest";
import { coalesceColdResponses, isForecastSourceStale, officialColdAlertObservation } from "./monitoring-runtime.js";

describe("forecast source freshness", () => {
  const now = new Date("2026-10-01T12:00:00.000Z");

  it("fails closed without a positive configured source age", () => {
    expect(isForecastSourceStale("2026-10-01T11:59:00.000Z", now, undefined)).toBe(true);
    expect(isForecastSourceStale("2026-10-01T11:59:00.000Z", now, "0")).toBe(true);
  });

  it("uses provider source time even when retrieval is fresh", () => {
    expect(isForecastSourceStale("2026-10-01T08:00:00.000Z", now, "180")).toBe(true);
    expect(isForecastSourceStale("2026-10-01T09:00:01.000Z", now, "180")).toBe(false);
  });
});

describe("cold response coalescing", () => {
  it("combines crops with the same reviewed action policy into one stable group", () => {
    const shared = { stage: "transplanted", thresholdCelsius: 2, clearAboveCelsius: 4, resolutionConfirmations: 2, deliveryClass: "urgent" as const, action: "Cover before sunset." };
    const groups = coalesceColdResponses([
      { ...shared, cropId: "tomato", affectedIds: ["selection-tomato"] },
      { ...shared, cropId: "pepper", affectedIds: ["selection-pepper"] },
      { ...shared, cropId: "basil", action: "Move indoors.", affectedIds: ["selection-basil"] },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find(({ action }) => action === shared.action)).toMatchObject({ cropId: "pepper,tomato", affectedIds: ["selection-pepper", "selection-tomato"], groupKey: "crops:pepper,tomato:transplanted:2:4:2:urgent" });
    expect(groups.find(({ action }) => action === "Move indoors.")?.groupKey).toBe("basil:transplanted");
  });
});

describe("official cold alert policy", () => {
  const now = new Date("2026-10-01T12:00:00.000Z");
  const alert = { provider: "nws" as const, providerAlertId: "urn:oid:fixture", event: "Freeze Warning", status: "Actual", messageType: "Alert", sentAt: "2026-10-01T10:00:00.000Z", effectiveAt: "2026-10-01T11:00:00.000Z", onsetAt: null, expiresAt: "2026-10-01T18:00:00.000Z", endsAt: null, cancelled: false, headline: "Freeze Warning issued", sourceUrl: "https://api.weather.gov/alerts/fixture", areaDescription: "Fixture County" };

  it("creates one urgent garden-wide observation for supported actual alerts", () => {
    expect(officialColdAlertObservation(alert, now, ["selection-b", "selection-a"])).toMatchObject({
      groupKey: "nws:urn:oid:fixture",
      observation: { status: "evaluated", candidate: { hazard: "official_alert", affectedIds: ["selection-b", "selection-a"], deliveryClass: "urgent", validThrough: alert.expiresAt } },
    });
  });

  it("resolves only from an explicit cancellation or known expiry", () => {
    expect(officialColdAlertObservation({ ...alert, cancelled: true, messageType: "Cancel" }, now, [])).toEqual({ groupKey: "nws:urn:oid:fixture", observation: { status: "evaluated" } });
    expect(officialColdAlertObservation(alert, new Date("2026-10-01T18:00:01.000Z"), [])).toEqual({ groupKey: "nws:urn:oid:fixture", observation: { status: "evaluated" } });
  });

  it("ignores tests and unrelated advisories", () => {
    expect(officialColdAlertObservation({ ...alert, status: "Test" }, now, [])).toBeNull();
    expect(officialColdAlertObservation({ ...alert, event: "Wind Advisory" }, now, [])).toBeNull();
  });
});
