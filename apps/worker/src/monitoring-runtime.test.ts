import { describe, expect, it } from "vitest";
import { isForecastSourceStale } from "./monitoring-runtime.js";

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
