import { z } from "zod";

export const coordinateSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

export const geocodeRequestSchema = z.object({
  text: z.string().trim().min(3).max(300),
  limit: z.number().int().min(1).max(10).default(5),
});

export const geocodeCandidateSchema = z.object({
  provider: z.literal("geoapify"),
  providerPlaceId: z.string().min(1),
  formattedAddress: z.string().min(1),
  coordinate: coordinateSchema,
  timezone: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).nullable(),
  resultType: z.string().nullable(),
  attribution: z.string().min(1),
});

export const confirmedLocationSchema = z.object({
  coordinate: coordinateSchema,
  timezone: z.string().min(1),
  source: z.enum(["geocoded", "manual_pin"]),
  providerPlaceId: z.string().optional(),
  formattedAddress: z.string().max(500).optional(),
}).superRefine((value, context) => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value.timezone }); }
  catch { context.addIssue({ code: "custom", path: ["timezone"], message: "Timezone must be a valid IANA timezone" }); }
  if (value.source === "geocoded" && !value.providerPlaceId) context.addIssue({ code: "custom", path: ["providerPlaceId"], message: "A geocoded location requires a provider place ID" });
});

export const climateValueStateSchema = z.enum(["known", "frost_free", "unknown", "uncertain"]);
export const monthDaySchema = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/u, "Expected MM-DD");
export const climateSourceEvidenceSchema = z.object({
  kind: z.enum(["hardiness", "frost_normals", "combined_fixture"]),
  datasetVersionId: z.string().uuid(),
  recordId: z.string().uuid(),
  sourceName: z.string().min(1),
  sourceRelease: z.string().min(1),
  attribution: z.string().min(1),
  distanceMeters: z.number().nonnegative(),
  elevationDifferenceMeters: z.number().nonnegative().nullable(),
  confidence: z.number().min(0).max(1),
});

export const climateRecordSchema = z.object({
  externalId: z.string().min(1),
  coordinate: coordinateSchema,
  elevationMeters: z.number().finite().nullable(),
  hardinessZone: z.string().min(1).nullable(),
  frostState: climateValueStateSchema,
  springFrostLocalDate: monthDaySchema.nullable(),
  autumnFrostLocalDate: monthDaySchema.nullable(),
  referencePeriod: z.string().min(1).nullable(),
  probabilityPercent: z.number().min(0).max(100).nullable(),
}).superRefine((value, context) => {
  if (value.frostState === "known" && (!value.springFrostLocalDate || !value.autumnFrostLocalDate)) context.addIssue({ code: "custom", path: ["frostState"], message: "Known frost records require spring and autumn dates" });
  if (value.frostState === "frost_free" && (value.springFrostLocalDate || value.autumnFrostLocalDate)) context.addIssue({ code: "custom", path: ["frostState"], message: "Frost-free records cannot contain frost dates" });
});

export const climateDatasetManifestSchema = z.object({
  kind: z.enum(["hardiness", "frost_normals", "combined_fixture"]),
  sourceName: z.string().min(1),
  sourceRelease: z.string().min(1),
  sourceUrl: z.string().url(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  normalizationVersion: z.number().int().positive(),
  attribution: z.string().min(1),
  coverage: z.record(z.string(), z.unknown()),
  records: z.array(climateRecordSchema).min(1),
});

export const climateAssociationSchema = z.object({
  id: z.string().uuid(),
  gardenId: z.string().uuid(),
  datasetVersionId: z.string().uuid().nullable(),
  recordId: z.string().uuid().nullable(),
  state: climateValueStateSchema,
  hardinessZone: z.string().nullable(),
  springFrostLocalDate: monthDaySchema.nullable(),
  autumnFrostLocalDate: monthDaySchema.nullable(),
  distanceMeters: z.number().nonnegative().nullable(),
  elevationDifferenceMeters: z.number().nonnegative().nullable(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  source: z.enum(["dataset_match", "user_anchor", "unavailable"]),
  sourceEvidence: z.array(climateSourceEvidenceSchema).default([]),
});

export type Coordinate = z.infer<typeof coordinateSchema>;
export type GeocodeCandidate = z.infer<typeof geocodeCandidateSchema>;
export type ClimateRecordInput = z.infer<typeof climateRecordSchema>;
export type ClimateDatasetManifest = z.infer<typeof climateDatasetManifestSchema>;
