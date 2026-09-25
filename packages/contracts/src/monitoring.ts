import { z } from "zod";

export const weatherRiskStateSchema = z.enum(["unknown", "clear", "active", "resolved"]);
export const weatherEvaluationStatusSchema = z.enum(["evaluated", "insufficient_inputs", "stale", "unavailable"]);
export const recommendationTransitionKindSchema = z.enum(["warning", "material_change", "resolution", "renewed_warning"]);

export const forecastIntervalSchema = z.object({
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  temperatureCelsius: z.number(),
}).strict().refine((value) => new Date(value.start) < new Date(value.end), "forecast interval must have positive duration");

export const normalizedForecastSchema = z.object({
  provider: z.literal("nws"),
  sourceKey: z.string().min(1),
  sourceUpdatedAt: z.iso.datetime(),
  retrievedAt: z.iso.datetime(),
  validFrom: z.iso.datetime(),
  validThrough: z.iso.datetime(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  normalizationVersion: z.literal(1),
  intervals: z.array(forecastIntervalSchema).min(1),
}).strict();

export const normalizedOfficialAlertSchema = z.object({
  provider: z.literal("nws"),
  providerAlertId: z.string().min(1),
  event: z.string().min(1),
  status: z.string().min(1),
  messageType: z.string().min(1),
  sentAt: z.iso.datetime(),
  effectiveAt: z.iso.datetime(),
  onsetAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable(),
  cancelled: z.boolean(),
  headline: z.string().nullable(),
  sourceUrl: z.url(),
  areaDescription: z.string(),
}).strict();

export const weatherEvaluationRequestSchema = z.object({
  gardenId: z.string().uuid(),
  reason: z.enum(["manual", "scheduled", "plan_activated", "progress_recorded", "location_changed", "recovery"]),
  requestedAt: z.iso.datetime(),
}).strict();

export type WeatherRiskState = z.infer<typeof weatherRiskStateSchema>;
export type WeatherEvaluationStatus = z.infer<typeof weatherEvaluationStatusSchema>;
export type RecommendationTransitionKind = z.infer<typeof recommendationTransitionKindSchema>;
export type NormalizedForecast = z.infer<typeof normalizedForecastSchema>;
export type NormalizedOfficialAlert = z.infer<typeof normalizedOfficialAlertSchema>;
export type WeatherEvaluationRequest = z.infer<typeof weatherEvaluationRequestSchema>;
