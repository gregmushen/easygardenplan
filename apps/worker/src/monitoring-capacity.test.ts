import { describe, expect, it } from "vitest";
import { monitoringCapacity, pilotMonitoringAssumptions, weatherMonitoringCron, weatherSchedulerRetryMinutes } from "./monitoring-capacity.js";

describe("monitoring launch capacity", () => {
  it("drains the declared 1,000-garden hourly pilot load with bounded headroom", () => {
    expect(weatherMonitoringCron).toBe("*/2 * * * *");
    expect(monitoringCapacity(pilotMonitoringAssumptions)).toEqual({
      evaluationsPerHour: 1_000,
      schedulerCapacityPerHour: 1_500,
      capacityHeadroom: 1.5,
      monthlyEvaluations: 720_000,
      monthlyProviderRequests: 2_160_000,
      averageProviderRequestsPerSecond: 0.833,
      sufficient: true,
    });
  });

  it("fails visibly when scheduler capacity is below the assumed load", () => {
    expect(monitoringCapacity({ ...pilotMonitoringAssumptions, activeGardens: 2_000 })).toMatchObject({ sufficient: false, capacityHeadroom: 0.75 });
    expect(() => monitoringCapacity({ ...pilotMonitoringAssumptions, schedulerEveryMinutes: 7 })).toThrow("divide one hour");
  });

  it("backs scheduler storage failures off without exceeding one hour", () => {
    expect([0, 1, 2, 3, 4, 20].map(weatherSchedulerRetryMinutes)).toEqual([5, 10, 20, 40, 60, 60]);
    expect(() => weatherSchedulerRetryMinutes(-1)).toThrow("nonnegative integer");
  });
});
