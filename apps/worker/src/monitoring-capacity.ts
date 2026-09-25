export const weatherMonitoringCron = "*/2 * * * *";
export const weatherSchedulerBatchSize = 50;
export const weatherSchedulerConcurrency = 5;

export function weatherSchedulerRetryMinutes(priorFailures: number): number {
  if (!Number.isInteger(priorFailures) || priorFailures < 0) throw new Error("priorFailures must be a nonnegative integer");
  return Math.min(60, 5 * 2 ** Math.min(priorFailures, 4));
}

export type MonitoringCapacityAssumptions = Readonly<{
  activeGardens: number;
  refreshMinutes: number;
  schedulerEveryMinutes: number;
  batchSize: number;
  providerRequestsPerEvaluation: number;
  daysPerMonth: number;
}>;

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

/**
 * A conservative capacity model: every garden is assumed to occupy its own
 * NWS point/grid, so it takes a point lookup, hourly forecast, and alert call.
 * Any later shared-grid cache improves this result rather than hiding load.
 */
export function monitoringCapacity(input: MonitoringCapacityAssumptions) {
  const activeGardens = positiveInteger(input.activeGardens, "activeGardens");
  const refreshMinutes = positiveInteger(input.refreshMinutes, "refreshMinutes");
  const schedulerEveryMinutes = positiveInteger(input.schedulerEveryMinutes, "schedulerEveryMinutes");
  const batchSize = positiveInteger(input.batchSize, "batchSize");
  const providerRequestsPerEvaluation = positiveInteger(input.providerRequestsPerEvaluation, "providerRequestsPerEvaluation");
  const daysPerMonth = positiveInteger(input.daysPerMonth, "daysPerMonth");
  if (60 % schedulerEveryMinutes !== 0) throw new Error("schedulerEveryMinutes must divide one hour evenly");

  const evaluationsPerHour = activeGardens * 60 / refreshMinutes;
  const schedulerCapacityPerHour = batchSize * 60 / schedulerEveryMinutes;
  const monthlyEvaluations = activeGardens * 24 * 60 / refreshMinutes * daysPerMonth;
  const monthlyProviderRequests = monthlyEvaluations * providerRequestsPerEvaluation;
  return {
    evaluationsPerHour,
    schedulerCapacityPerHour,
    capacityHeadroom: Number((schedulerCapacityPerHour / evaluationsPerHour).toFixed(3)),
    monthlyEvaluations,
    monthlyProviderRequests,
    averageProviderRequestsPerSecond: Number((monthlyProviderRequests / (daysPerMonth * 24 * 60 * 60)).toFixed(3)),
    sufficient: schedulerCapacityPerHour >= evaluationsPerHour,
  };
}

export const pilotMonitoringAssumptions: MonitoringCapacityAssumptions = {
  activeGardens: 1_000,
  refreshMinutes: 60,
  schedulerEveryMinutes: 2,
  batchSize: weatherSchedulerBatchSize,
  providerRequestsPerEvaluation: 3,
  daysPerMonth: 30,
};
