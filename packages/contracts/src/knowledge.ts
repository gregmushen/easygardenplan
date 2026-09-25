import { z } from "zod";

export const knowledgeValueStateSchema = z.enum(["known", "not_applicable", "unknown", "conflicted"]);
export const growingMethodSchema = z.enum(["direct_sow", "indoor_start", "purchased_start"]);
export const ruleTypeSchema = z.enum(["spacing", "light", "planting_window", "seed_start_lead", "maturity", "environmental_prerequisite", "support", "climate_response", "instruction"]);

const rangeSchema = z.object({ minimum: z.number(), maximum: z.number(), minimumInclusive: z.boolean().default(true), maximumInclusive: z.boolean().default(true) }).strict().refine((value) => value.minimum <= value.maximum, "minimum must not exceed maximum");
export const applicabilitySchema = z.object({
  methods: z.array(growingMethodSchema).min(1),
  regionIds: z.array(z.string().min(1)).default([]),
  climateRegimes: z.array(z.string().min(1)).default([]),
  hardinessZones: z.array(z.string().min(1)).default([]),
  elevationMeters: rangeSchema.optional(),
  varietyIds: z.array(z.string().uuid()).default([]),
  cultivation: z.enum(["outdoor", "indoor", "protected"]).optional(),
  stage: z.string().min(1).optional(),
}).strict();

const unavailableSchema = z.object({ state: z.enum(["not_applicable", "unknown", "conflicted"]), reason: z.string().min(1).max(500) }).strict();
const spacingSchema = z.object({ state: z.literal("known"), type: z.literal("spacing"), withinRowMeters: rangeSchema, betweenRowMeters: rangeSchema.optional(), pattern: z.enum(["individual", "row", "area"]), sourceUnit: z.string().min(1) }).strict();
const lightSchema = z.object({ state: z.literal("known"), type: z.literal("light"), exposures: z.array(z.enum(["full_sun", "partial_sun", "shade"])).min(1), minimumDirectSunHours: z.number().min(0).max(24).optional() }).strict();
const anchorSchema = z.enum(["spring_last_freeze_32f", "spring_last_freeze_28f", "autumn_first_freeze_32f", "autumn_first_freeze_28f"]);
const offsetWindowSchema = z.object({ kind: z.literal("anchor_offset"), anchor: anchorSchema, startOffsetDays: z.number().int(), endOffsetDays: z.number().int() }).strict().refine((value) => value.startOffsetDays <= value.endOffsetDays, "window start must not exceed end");
const calendarWindowSchema = z.object({ kind: z.literal("calendar"), startMonth: z.number().int().min(1).max(12), startDay: z.number().int().min(1).max(31), endMonth: z.number().int().min(1).max(12), endDay: z.number().int().min(1).max(31), endYearOffset: z.union([z.literal(0), z.literal(1)]) }).strict();
const plantingWindowSchema = z.object({ state: z.literal("known"), type: z.literal("planting_window"), windows: z.array(z.union([offsetWindowSchema, calendarWindowSchema])).min(1) }).strict();
const seedLeadSchema = z.object({ state: z.literal("known"), type: z.literal("seed_start_lead"), daysBeforeTransplant: rangeSchema }).strict();
const maturitySchema = z.object({ state: z.literal("known"), type: z.literal("maturity"), days: rangeSchema, anchor: z.enum(["sowing", "emergence", "transplant"]), sourceUnit: z.literal("calendar_days") }).strict();
const prerequisiteSchema = z.object({ state: z.literal("known"), type: z.literal("environmental_prerequisite"), condition: z.enum(["soil_temperature_c", "air_temperature_c", "soil_moisture"]), range: rangeSchema, sourceUnit: z.string().min(1) }).strict();
const supportSchema = z.object({ state: z.literal("known"), type: z.literal("support"), required: z.boolean(), guidance: z.string().min(1).max(2000), stage: z.string().min(1).optional() }).strict();
const climateResponseSchema = z.object({ state: z.literal("known"), type: z.literal("climate_response"), hazard: z.enum(["cold", "heat"]), stage: z.string().min(1), thresholdCelsius: rangeSchema, clearAboveCelsius: z.number(), resolutionConfirmations: z.number().int().min(1).max(12), deliveryClass: z.enum(["urgent", "routine_digest"]).default("urgent"), action: z.string().min(1).max(2000) }).strict().refine((value) => value.clearAboveCelsius > value.thresholdCelsius.maximum, "clear threshold must exceed the activation threshold");
const instructionSchema = z.object({ state: z.literal("known"), type: z.literal("instruction"), stage: z.string().min(1), text: z.string().min(1).max(4000) }).strict();

export const knownRulePayloadSchema = z.discriminatedUnion("type", [spacingSchema, lightSchema, plantingWindowSchema, seedLeadSchema, maturitySchema, prerequisiteSchema, supportSchema, climateResponseSchema, instructionSchema]);
export const rulePayloadSchema = z.union([knownRulePayloadSchema, unavailableSchema]);
export const cropSchema = z.object({ id: z.string().uuid(), slug: z.string().min(1), commonName: z.string().min(1), scientificName: z.string().nullable(), status: z.enum(["draft", "published", "retired"]) });
export const publishedRuleSchema = z.object({ id: z.string().uuid(), familyId: z.string().uuid(), cropId: z.string().uuid(), varietyId: z.string().uuid().nullable(), ruleType: ruleTypeSchema, version: z.number().int().positive(), applicability: applicabilitySchema, payload: rulePayloadSchema, publishedAt: z.coerce.date(), evidenceIds: z.array(z.string().uuid()).min(1), overridesRuleVersionIds: z.array(z.string().uuid()).default([]) });

export const researchBriefSchema = z.object({ cropNames: z.array(z.string().min(1)).min(1).max(20), methods: z.array(growingMethodSchema).min(1), regionClasses: z.array(z.string().min(1)).min(1), ruleTypes: z.array(ruleTypeSchema).min(1), customerData: z.never().optional() }).strict();
export const editorialPublicationSchema = z.object({ releaseName: z.string().min(1).max(120), ruleVersionIds: z.array(z.string().uuid()).min(1), reviewerId: z.string().min(1), note: z.string().min(1).max(2000) }).strict();
export const editorialDraftSchema = z.object({
  cropId: z.string().uuid(),
  varietyId: z.string().uuid().optional(),
  ruleType: ruleTypeSchema,
  method: growingMethodSchema,
  contextKey: z.string().min(1).max(120).default("default"),
  applicability: applicabilitySchema,
  payload: rulePayloadSchema,
  overridesRuleVersionIds: z.array(z.string().uuid()).max(50).default([]),
  source: z.object({ url: z.url(), title: z.string().min(1), publisher: z.string().min(1), sourceType: z.string().min(1), accessedAt: z.coerce.date(), attributionNotes: z.string().max(2000).optional(), contentChecksum: z.string().max(128).optional() }).strict(),
  evidence: z.object({ researchRunId: z.string().uuid().optional(), locator: z.string().max(500).optional(), permittedExcerpt: z.string().max(500).optional(), normalizedClaim: z.string().min(1).max(4000), scope: z.record(z.string(), z.unknown()), originalUnits: z.string().max(120).optional() }).strict(),
}).strict();

export type Applicability = z.infer<typeof applicabilitySchema>;
export type RulePayload = z.infer<typeof rulePayloadSchema>;
export type RuleType = z.infer<typeof ruleTypeSchema>;
export type GrowingMethod = z.infer<typeof growingMethodSchema>;
export type PublishedRule = z.infer<typeof publishedRuleSchema>;
export type ResearchBrief = z.infer<typeof researchBriefSchema>;
