import { describe, expect, it } from "vitest";
import { applicabilitySchema, researchBriefSchema, rulePayloadSchema } from "./knowledge.js";

describe("knowledge contracts", () => {
  it("keeps known, not-applicable, unknown, and conflicted states distinct", () => {
    for (const state of ["not_applicable", "unknown", "conflicted"] as const) expect(rulePayloadSchema.parse({ state, reason: state }).state).toBe(state);
    expect(rulePayloadSchema.parse({ state: "known", type: "spacing", withinRowMeters: { minimum: 0.3, maximum: 0.5 }, pattern: "individual", sourceUnit: "inches" }).state).toBe("known");
  });

  it("rejects reversed ranges and missing applicability methods", () => {
    expect(() => rulePayloadSchema.parse({ state: "known", type: "maturity", days: { minimum: 90, maximum: 60 }, anchor: "transplant", sourceUnit: "calendar_days" })).toThrow();
    expect(() => applicabilitySchema.parse({ methods: [] })).toThrow();
  });

  it("requires a reviewed anti-flapping policy for climate responses", () => {
    const base = { state: "known", type: "climate_response", hazard: "cold", stage: "seedling", thresholdCelsius: { minimum: 0, maximum: 2 }, action: "Cover plants" };
    expect(() => rulePayloadSchema.parse(base)).toThrow();
    expect(() => rulePayloadSchema.parse({ ...base, clearAboveCelsius: 2, resolutionConfirmations: 2 })).toThrow();
    expect(rulePayloadSchema.parse({ ...base, clearAboveCelsius: 3, resolutionConfirmations: 2 })).toMatchObject({ clearAboveCelsius: 3, resolutionConfirmations: 2, deliveryClass: "urgent" });
    expect(rulePayloadSchema.parse({ ...base, clearAboveCelsius: 3, resolutionConfirmations: 2, deliveryClass: "routine_digest" })).toMatchObject({ deliveryClass: "routine_digest" });
  });

  it("rejects private customer data in research briefs", () => {
    expect(() => researchBriefSchema.parse({ cropNames: ["tomato"], methods: ["direct_sow"], regionClasses: ["hot_summer"], ruleTypes: ["spacing"], customerData: { address: "private" } })).toThrow();
  });
});
