import { describe, expect, it } from "vitest";
import { coalesceColdResponses, isForecastSourceStale } from "./monitoring-runtime.js";

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
