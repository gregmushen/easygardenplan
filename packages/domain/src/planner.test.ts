import { describe, expect, it } from "vitest";
import { generatePlan } from "./planner.js";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const input = { gardenId: id(1), gardenRevision: 1, timezone: "America/Los_Angeles", seasonYear: 2027, catalogReleaseId: id(2), climate: { associationId: id(10), version: 1, state: "known", hardinessZone: "8b", springFrostLocalDate: "04-15", autumnFrostLocalDate: "10-20", source: "fixture" }, algorithmVersion: "grid-v1", beds: [{ id: id(3), revisionId: id(4), revision: 1, geometry: { outer: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }], exclusions: [] } }], selections: [{ id: id(5), cropId: id(6), varietyId: null, method: "direct_sow", quantity: 6, preferredBedId: null, bedRestriction: "soft", priority: 0, revision: 1 }], rules: [{ id: id(7), familyId: id(8), cropId: id(6), varietyId: null, ruleType: "spacing", version: 1, applicability: { methods: ["direct_sow"], regionIds: [], climateRegimes: [], hardinessZones: [], varietyIds: [] }, payload: { state: "known", type: "spacing", withinRowMeters: { minimum: 1, maximum: 1, minimumInclusive: true, maximumInclusive: true }, pattern: "individual", sourceUnit: "meters" }, publishedAt: new Date("2026-01-01"), evidenceIds: [id(9)] }] };

describe("deterministic planner", () => {
  it("returns identical results and accounts for every requested plant", async () => {
    const first = await generatePlan(input); const second = await generatePlan(structuredClone(input));
    expect(second).toEqual(first); expect(first.selections[0]!.requested).toBe(first.selections[0]!.placed + first.selections[0]!.unplaced); expect(first.selections[0]).toMatchObject({ placed: 4, unplaced: 2, reasonCodes: ["layout_search_exhausted"] });
  });
  it("keeps missing rules explicit and distinguishes a search budget", async () => {
    expect((await generatePlan({ ...input, rules: [] })).selections[0]).toMatchObject({ placed: 0, reasonCodes: ["missing_spacing_rule"] });
    expect((await generatePlan(input, 1)).selections[0]!.reasonCodes).toEqual(["search_budget_exhausted"]);
  });
  it("resolves cross-year, leap-day, anchored, and missing-anchor windows as local dates", async () => {
    const windowRule = { id: id(11), familyId: id(12), cropId: id(6), varietyId: null, ruleType: "planting_window", version: 1, applicability: { methods: ["direct_sow"], regionIds: [], climateRegimes: [], hardinessZones: [], varietyIds: [] }, payload: { state: "known", type: "planting_window", windows: [{ kind: "calendar", startMonth: 11, startDay: 1, endMonth: 2, endDay: 29, endYearOffset: 1 }, { kind: "anchor_offset", anchor: "spring_last_freeze_32f", startOffsetDays: -7, endOffsetDays: 7 }] }, publishedAt: new Date("2026-01-01"), evidenceIds: [id(9)] };
    const result = await generatePlan({ ...input, rules: [...input.rules, windowRule] });
    expect(result.scheduleWindows.map(({ startLocalDate, endLocalDate }) => [startLocalDate, endLocalDate])).toEqual([["2027-04-08", "2027-04-22"], ["2027-11-01", "2028-02-29"]]);
    const missing = await generatePlan({ ...input, climate: null, rules: [...input.rules, { ...windowRule, payload: { state: "known", type: "planting_window", windows: [{ kind: "anchor_offset", anchor: "spring_last_freeze_32f", startOffsetDays: 0, endOffsetDays: 1 }] } }] });
    expect(missing.unresolved).toContainEqual({ selectionId: id(5), kind: "schedule", code: "missing_anchor:spring_last_freeze_32f" });
    const nonLeap = await generatePlan({ ...input, seasonYear: 2026, rules: [...input.rules, { ...windowRule, payload: { state: "known", type: "planting_window", windows: [{ kind: "calendar", startMonth: 2, startDay: 29, endMonth: 3, endDay: 1, endYearOffset: 0 }] } }] });
    expect(nonLeap.scheduleWindows[0]?.startLocalDate).toBe("2026-02-28");
  });
});
