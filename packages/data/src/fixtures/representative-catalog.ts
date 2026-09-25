import type { PublishedRule, RulePayload, RuleType } from "@easygardenplan/contracts";

export const representativeCropId = "10000000-0000-4000-8000-000000000001";
const evidenceId = "20000000-0000-4000-8000-000000000001";
const regionClasses = ["cold_continental", "cool_maritime", "hot_summer", "arid", "high_elevation", "frost_free", "alaska", "hawaii"];

const payloads: Record<RuleType, RulePayload> = {
  spacing: { state: "known", type: "spacing", withinRowMeters: { minimum: 0.3, maximum: 0.5, minimumInclusive: true, maximumInclusive: true }, betweenRowMeters: { minimum: 0.6, maximum: 0.9, minimumInclusive: true, maximumInclusive: true }, pattern: "individual", sourceUnit: "meters" },
  light: { state: "known", type: "light", exposures: ["full_sun"], minimumDirectSunHours: 6 },
  planting_window: { state: "known", type: "planting_window", windows: [{ kind: "anchor_offset", anchor: "spring_last_freeze_32f", startOffsetDays: 7, endOffsetDays: 28 }, { kind: "calendar", startMonth: 11, startDay: 1, endMonth: 2, endDay: 15, endYearOffset: 1 }] },
  seed_start_lead: { state: "known", type: "seed_start_lead", daysBeforeTransplant: { minimum: 42, maximum: 56, minimumInclusive: true, maximumInclusive: true } },
  maturity: { state: "known", type: "maturity", days: { minimum: 60, maximum: 90, minimumInclusive: true, maximumInclusive: true }, anchor: "transplant", sourceUnit: "calendar_days" },
  environmental_prerequisite: { state: "known", type: "environmental_prerequisite", condition: "soil_temperature_c", range: { minimum: 10, maximum: 35, minimumInclusive: true, maximumInclusive: true }, sourceUnit: "celsius" },
  support: { state: "known", type: "support", required: true, guidance: "Synthetic fixture support instruction", stage: "vegetative" },
  climate_response: { state: "known", type: "climate_response", hazard: "cold", stage: "seedling", thresholdCelsius: { minimum: 0, maximum: 5, minimumInclusive: true, maximumInclusive: true }, clearAboveCelsius: 6, resolutionConfirmations: 2, action: "Synthetic fixture action" },
  instruction: { state: "known", type: "instruction", stage: "transplant", text: "Synthetic fixture instruction" },
};

export const representativeRules: PublishedRule[] = (Object.keys(payloads) as RuleType[]).map((ruleType, index) => ({
  id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  familyId: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  cropId: representativeCropId,
  varietyId: null,
  ruleType,
  version: 1,
  applicability: { methods: [ruleType === "seed_start_lead" ? "indoor_start" : "direct_sow"], regionIds: regionClasses, climateRegimes: [], hardinessZones: [], varietyIds: [] },
  payload: payloads[ruleType],
  publishedAt: new Date("2026-01-01T00:00:00.000Z"),
  evidenceIds: [evidenceId],
  overridesRuleVersionIds: [],
}));

export const representativeRegionClasses = regionClasses;
