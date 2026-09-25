import { planInputSnapshotSchema, type NormalizedForecast, type NormalizedOfficialAlert } from "@easygardenplan/contracts";
import { MonitoringRepository } from "@easygardenplan/data";
import { garden, gardenPlanVersion, gardenProgressEvent, type Database } from "@easygardenplan/db";
import { evaluateColdRisk, type RiskObservation } from "@easygardenplan/domain";
import { applicationEventCatalog, recommendationTransitionedEvent, type EventDefinition } from "@easygardenplan/events";
import { NwsAdapter, NwsAdapterError } from "@easygardenplan/integrations";
import { and, asc, eq } from "drizzle-orm";
import type { AuthEnvironment } from "@easygardenplan/auth";
import { createEventPublisher } from "./events.js";
import type { EventHandlerContext } from "./async-runtime.js";

function fixtureForecast(now: Date): NormalizedForecast {
  const start = new Date(now.getTime() + 60 * 60_000); const end = new Date(start.getTime() + 6 * 60 * 60_000);
  return { provider: "nws", sourceKey: "fixture/grid", sourceUpdatedAt: now.toISOString(), retrievedAt: now.toISOString(), validFrom: start.toISOString(), validThrough: end.toISOString(), fingerprint: "f".repeat(64), normalizationVersion: 1, intervals: [{ start: start.toISOString(), end: end.toISOString(), temperatureCelsius: 0 }] };
}

export function isForecastSourceStale(sourceUpdatedAt: string, now: Date, maximumAgeMinutes: string | undefined): boolean {
  const maximumAge = Number(maximumAgeMinutes);
  const sourceTime = new Date(sourceUpdatedAt).getTime();
  return !Number.isFinite(maximumAge) || maximumAge <= 0 || !Number.isFinite(sourceTime) || now.getTime() - sourceTime > maximumAge * 60_000;
}

type ColdResponseCandidate = {
  cropId: string; stage: string; thresholdCelsius: number; clearAboveCelsius: number; resolutionConfirmations: number;
  deliveryClass: "urgent" | "routine_digest"; action: string; affectedIds: string[];
};

export function coalesceColdResponses(candidates: ColdResponseCandidate[]): Array<ColdResponseCandidate & { groupKey: string }> {
  const grouped = new Map<string, ColdResponseCandidate[]>();
  for (const candidate of candidates) {
    const policy = JSON.stringify({ stage: candidate.stage, thresholdCelsius: candidate.thresholdCelsius, clearAboveCelsius: candidate.clearAboveCelsius, resolutionConfirmations: candidate.resolutionConfirmations, deliveryClass: candidate.deliveryClass, action: candidate.action });
    grouped.set(policy, [...(grouped.get(policy) ?? []), candidate]);
  }
  return [...grouped.values()].map((members) => {
    const first = members[0]!; const cropIds = [...new Set(members.map(({ cropId }) => cropId))].sort();
    const groupKey = cropIds.length === 1 ? `${cropIds[0]}:${first.stage}` : `crops:${cropIds.join(",")}:${first.stage}:${first.thresholdCelsius}:${first.clearAboveCelsius}:${first.resolutionConfirmations}:${first.deliveryClass}`;
    return { ...first, cropId: cropIds.join(","), affectedIds: [...new Set(members.flatMap(({ affectedIds }) => affectedIds))].sort(), groupKey };
  }).sort((left, right) => left.groupKey.localeCompare(right.groupKey));
}

const actionableColdAlert = /^(?:hard )?freeze (?:watch|warning)$|^frost advisory$/iu;

export function officialColdAlertObservation(alert: NormalizedOfficialAlert, now: Date, affectedIds: string[]): { groupKey: string; observation: RiskObservation } | null {
  if (!actionableColdAlert.test(alert.event)) return null;
  const groupKey = `nws:${alert.providerAlertId}`;
  if (alert.cancelled) return { groupKey, observation: { status: "evaluated" } };
  if (alert.status.toLowerCase() !== "actual") return null;
  const validFrom = alert.onsetAt ?? alert.effectiveAt;
  const validThrough = alert.endsAt ?? alert.expiresAt;
  if (new Date(validThrough) <= now) return { groupKey, observation: { status: "evaluated" } };
  if (new Date(validThrough) <= new Date(validFrom)) return null;
  return { groupKey, observation: { status: "evaluated", candidate: {
    hazard: "official_alert", groupKey, action: `Official ${alert.event}: follow local NWS instructions and protect cold-sensitive plants when needed.`, affectedIds, deliveryClass: "urgent", validFrom, validThrough,
    evidenceFingerprint: `${alert.providerAlertId}:${alert.sentAt}:${alert.messageType}`,
  } } };
}

export async function evaluateGardenWeather(input: { gardenId: string; environment: AuthEnvironment; context: EventHandlerContext<Database> }) {
  const { context } = input; if (!context.data || !context.organizationId) throw new Error("Weather evaluation requires tenant authority");
  const repository = new MonitoringRepository(context.data, context.organizationId, context.clock);
  const [place] = await context.data.select().from(garden).where(and(eq(garden.organizationId, context.organizationId), eq(garden.id, input.gardenId))).limit(1);
  if (!place || !place.monitoringEnabled || !place.locationConfirmed || !place.latitude || !place.longitude) return { evaluated: 0, reason: "ineligible" as const };
  const [active] = await context.data.select().from(gardenPlanVersion).where(and(eq(gardenPlanVersion.organizationId, context.organizationId), eq(gardenPlanVersion.gardenId, input.gardenId), eq(gardenPlanVersion.state, "active"))).limit(1);
  if (!active) return { evaluated: 0, reason: "no_active_plan" as const };
  const snapshot = planInputSnapshotSchema.parse(active.inputSnapshot);
  let forecast: NormalizedForecast | undefined;
  let forecastReason: NwsAdapterError["reason"] | undefined;
  let officialAlerts: NormalizedOfficialAlert[] = [];
  let officialAlertsReason: "complete" | NwsAdapterError["reason"] = "complete";
  if (input.environment.NWS_MODE === "live") {
    const adapter = new NwsAdapter({ userAgent: input.environment.NWS_USER_AGENT ?? "easygardenplan.com (weather integration)", clock: context.clock, onRequest: async () => await repository.recordProviderRequest("nws") });
    const [forecastResult, alertResult] = await Promise.allSettled([adapter.forecast(Number(place.latitude), Number(place.longitude)), adapter.alerts(Number(place.latitude), Number(place.longitude))]);
    if (alertResult.status === "fulfilled") {
      officialAlerts = alertResult.value;
      await repository.storeOfficialAlerts(input.gardenId, officialAlerts, context.clock.now());
    } else {
      const error = alertResult.reason;
      if (!(error instanceof NwsAdapterError)) throw error;
      officialAlertsReason = error.reason;
    }
    if (forecastResult.status === "rejected") {
      const error = forecastResult.reason;
      if (!(error instanceof NwsAdapterError)) throw error;
      forecastReason = error.reason;
    } else {
      forecast = forecastResult.value;
    }
  } else {
    forecast = fixtureForecast(context.clock.now());
  }
  const publisher = createEventPublisher({ organizationId: context.organizationId, correlationId: context.event.correlationId, clock: context.clock });
  const evaluateOfficialAlerts = async () => {
    let count = 0;
    if (officialAlertsReason === "complete") {
      const affectedIds = snapshot.selections.map(({ id }) => id);
      const processed = new Set<string>();
      for (const alert of officialAlerts) {
        const result = officialColdAlertObservation(alert, context.clock.now(), affectedIds);
        if (!result) continue;
        processed.add(result.groupKey);
        await repository.evaluate({ gardenId: input.gardenId, hazard: "official_alert", groupKey: result.groupKey, observation: result.observation, resolutionConfirmations: 1, event: (payload) => publisher.statement(recommendationTransitionedEvent.name, payload, { idempotencyKey: `recommendation-transition:${payload.transitionId}`, causationId: context.event.id }) });
        count++;
      }
      const [risks, recommendations] = await Promise.all([repository.listRisk(input.gardenId), repository.listRecommendations(input.gardenId)]);
      for (const risk of risks.filter(({ hazard, state, groupKey }) => hazard === "official_alert" && state !== "resolved" && !processed.has(groupKey))) {
        const latest = recommendations.find(({ episodeId }) => episodeId === risk.episodeId);
        if (!latest?.validThrough || latest.validThrough > context.clock.now()) continue;
        await repository.evaluate({ gardenId: input.gardenId, hazard: "official_alert", groupKey: risk.groupKey, observation: { status: "evaluated" }, resolutionConfirmations: 1, event: (payload) => publisher.statement(recommendationTransitionedEvent.name, payload, { idempotencyKey: `recommendation-transition:${payload.transitionId}`, causationId: context.event.id }) });
        count++;
      }
    } else {
      const officialRisks = (await repository.listRisk(input.gardenId)).filter(({ hazard }) => hazard === "official_alert");
      for (const risk of officialRisks) await repository.evaluate({ gardenId: input.gardenId, hazard: "official_alert", groupKey: risk.groupKey, observation: { status: "unavailable" } });
      count = officialRisks.length;
    }
    return count;
  };
  if (!forecast) {
    const risks = (await repository.listRisk(input.gardenId)).filter(({ hazard }) => hazard !== "official_alert");
    for (const risk of risks) await repository.evaluate({ gardenId: input.gardenId, hazard: risk.hazard as "cold" | "heat", groupKey: risk.groupKey, observation: { status: "unavailable" } });
    const officialEvaluated = await evaluateOfficialAlerts();
    return { evaluated: risks.length + officialEvaluated, reason: forecastReason!, officialAlertsStored: officialAlerts.length, officialAlertsReason };
  }
  const stored = await repository.storeForecast(forecast);
  const events = await context.data.select().from(gardenProgressEvent).where(and(eq(gardenProgressEvent.organizationId, context.organizationId), eq(gardenProgressEvent.gardenId, input.gardenId))).orderBy(asc(gardenProgressEvent.createdAt));
  const stageBySelection = new Map<string, string>();
  for (const event of events) {
    if (event.eventType === "sown") stageBySelection.set(event.selectionId, "sown");
    else if (event.eventType === "emerged") stageBySelection.set(event.selectionId, "emerged");
    else if (event.eventType === "transplanted") stageBySelection.set(event.selectionId, "transplanted");
    else if (event.eventType === "removed") stageBySelection.delete(event.selectionId);
  }
  const sourceStale = input.environment.NWS_MODE === "live" && isForecastSourceStale(forecast.sourceUpdatedAt, context.clock.now(), input.environment.NWS_MAX_SOURCE_AGE_MINUTES);
  const candidates: ColdResponseCandidate[] = [];
  for (const rule of snapshot.rules) {
    if (rule.payload.state !== "known" || rule.payload.type !== "climate_response" || rule.payload.hazard !== "cold") continue;
    const response = rule.payload;
    const affectedIds = snapshot.selections.filter((selection) => selection.cropId === rule.cropId && stageBySelection.get(selection.id) === response.stage).map(({ id }) => id);
    if (affectedIds.length === 0) continue;
    candidates.push({ cropId: rule.cropId, stage: response.stage, thresholdCelsius: response.thresholdCelsius.maximum, clearAboveCelsius: response.clearAboveCelsius, resolutionConfirmations: response.resolutionConfirmations, deliveryClass: response.deliveryClass, action: response.action, affectedIds });
  }
  const groups = coalesceColdResponses(candidates);
  for (const response of groups) {
    const observation = sourceStale ? { status: "stale" as const } : evaluateColdRisk({ intervals: forecast.intervals, thresholdCelsius: response.thresholdCelsius, clearAboveCelsius: response.clearAboveCelsius, action: response.action, affectedIds: response.affectedIds, groupKey: response.groupKey, evidenceFingerprint: forecast.fingerprint, deliveryClass: response.deliveryClass, now: context.clock.now(), horizonThrough: new Date(context.clock.now().getTime() + 48 * 60 * 60_000) });
    await repository.evaluate({ gardenId: input.gardenId, hazard: "cold", groupKey: response.groupKey, observation, snapshotId: stored.id, resolutionConfirmations: response.resolutionConfirmations, event: (payload) => publisher.statement(recommendationTransitionedEvent.name, payload, { idempotencyKey: `recommendation-transition:${payload.transitionId}`, causationId: context.event.id }) });
  }
  const officialEvaluated = await evaluateOfficialAlerts();
  const evaluated = groups.length + officialEvaluated;
  return { evaluated, reason: evaluated ? "complete" as const : "no_applicable_rules" as const, officialAlertsStored: officialAlerts.length, officialAlertsReason };
}

export async function handleWeatherEvaluationRequested(payload: { gardenId: string }, _envelope: unknown, environment: AuthEnvironment, context: EventHandlerContext<Database>): Promise<void> {
  await evaluateGardenWeather({ gardenId: payload.gardenId, environment, context });
}

export const weatherEvaluationRequestedConsumer: EventDefinition<{ gardenId: string; reason: string; requestedAt: string }> = {
  name: "garden.weather_evaluation.requested", schemaVersion: 1,
  parse(payload: unknown) { return applicationEventCatalog.parse("garden.weather_evaluation.requested", 1, payload) as { gardenId: string; reason: string; requestedAt: string }; },
};
