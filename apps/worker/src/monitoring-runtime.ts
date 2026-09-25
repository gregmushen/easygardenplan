import { planInputSnapshotSchema, type NormalizedForecast, type NormalizedOfficialAlert } from "@easygardenplan/contracts";
import { MonitoringRepository } from "@easygardenplan/data";
import { garden, gardenPlanVersion, gardenProgressEvent, type Database } from "@easygardenplan/db";
import { evaluateColdRisk } from "@easygardenplan/domain";
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

export async function evaluateGardenWeather(input: { gardenId: string; environment: AuthEnvironment; context: EventHandlerContext<Database> }) {
  const { context } = input; if (!context.data || !context.organizationId) throw new Error("Weather evaluation requires tenant authority");
  const repository = new MonitoringRepository(context.data, context.organizationId, context.clock);
  const [place] = await context.data.select().from(garden).where(and(eq(garden.organizationId, context.organizationId), eq(garden.id, input.gardenId))).limit(1);
  if (!place || !place.monitoringEnabled || !place.locationConfirmed || !place.latitude || !place.longitude) return { evaluated: 0, reason: "ineligible" as const };
  const [active] = await context.data.select().from(gardenPlanVersion).where(and(eq(gardenPlanVersion.organizationId, context.organizationId), eq(gardenPlanVersion.gardenId, input.gardenId), eq(gardenPlanVersion.state, "active"))).limit(1);
  if (!active) return { evaluated: 0, reason: "no_active_plan" as const };
  const snapshot = planInputSnapshotSchema.parse(active.inputSnapshot);
  let forecast: NormalizedForecast;
  let officialAlerts: NormalizedOfficialAlert[] = [];
  let officialAlertsReason: "complete" | NwsAdapterError["reason"] = "complete";
  if (input.environment.NWS_MODE === "live") {
    const adapter = new NwsAdapter({ userAgent: input.environment.NWS_USER_AGENT ?? "easygardenplan.com (weather integration)", clock: context.clock });
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
      const risks = await repository.listRisk(input.gardenId);
      for (const risk of risks) await repository.evaluate({ gardenId: input.gardenId, hazard: risk.hazard as "cold" | "heat" | "official_alert", groupKey: risk.groupKey, observation: { status: "unavailable" } });
      return { evaluated: risks.length, reason: error.reason, officialAlertsStored: officialAlerts.length, officialAlertsReason };
    }
    forecast = forecastResult.value;
  } else {
    forecast = fixtureForecast(context.clock.now());
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
  const configuredSourceAge = Number(input.environment.NWS_MAX_SOURCE_AGE_MINUTES);
  const sourceStale = input.environment.NWS_MODE === "live" && (!Number.isFinite(configuredSourceAge) || configuredSourceAge <= 0 || context.clock.now().getTime() - new Date(forecast.sourceUpdatedAt).getTime() > configuredSourceAge * 60_000);
  const publisher = createEventPublisher({ organizationId: context.organizationId, correlationId: context.event.correlationId, clock: context.clock });
  let evaluated = 0;
  for (const rule of snapshot.rules) {
    if (rule.payload.state !== "known" || rule.payload.type !== "climate_response" || rule.payload.hazard !== "cold") continue;
    const response = rule.payload;
    const affectedIds = snapshot.selections.filter((selection) => selection.cropId === rule.cropId && stageBySelection.get(selection.id) === response.stage).map(({ id }) => id);
    if (affectedIds.length === 0) continue;
    const groupKey = `${rule.cropId}:${response.stage}`;
    const observation = sourceStale ? { status: "stale" as const } : evaluateColdRisk({ intervals: forecast.intervals, thresholdCelsius: response.thresholdCelsius.maximum, action: response.action, affectedIds, groupKey, evidenceFingerprint: forecast.fingerprint, now: context.clock.now(), horizonThrough: new Date(context.clock.now().getTime() + 48 * 60 * 60_000) });
    await repository.evaluate({ gardenId: input.gardenId, hazard: "cold", groupKey, observation, snapshotId: stored.id, event: (payload) => publisher.statement(recommendationTransitionedEvent.name, payload, { idempotencyKey: `recommendation-transition:${payload.transitionId}`, causationId: context.event.id }) });
    evaluated++;
  }
  return { evaluated, reason: evaluated ? "complete" as const : "no_applicable_rules" as const, officialAlertsStored: officialAlerts.length, officialAlertsReason };
}

export async function handleWeatherEvaluationRequested(payload: { gardenId: string }, _envelope: unknown, environment: AuthEnvironment, context: EventHandlerContext<Database>): Promise<void> {
  await evaluateGardenWeather({ gardenId: payload.gardenId, environment, context });
}

export const weatherEvaluationRequestedConsumer: EventDefinition<{ gardenId: string; reason: string; requestedAt: string }> = {
  name: "garden.weather_evaluation.requested", schemaVersion: 1,
  parse(payload: unknown) { return applicationEventCatalog.parse("garden.weather_evaluation.requested", 1, payload) as { gardenId: string; reason: string; requestedAt: string }; },
};
