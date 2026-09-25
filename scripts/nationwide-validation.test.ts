import { describe, expect, it } from "vitest";

import { representativeClimateRecords } from "../packages/data/src/fixtures/representative-climate.js";
import { calibrationScale, generatePlan, localToGeographic, projectToLocal, validateBedGeometry } from "../packages/domain/src/index.js";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const timezones: Record<string, string> = {
  "cold-continental-mn": "America/Chicago",
  "cool-maritime-wa": "America/Los_Angeles",
  "hot-summer-tx": "America/Chicago",
  "arid-az": "America/Phoenix",
  "high-elevation-co": "America/Denver",
  "frost-free-fl": "America/New_York",
  alaska: "America/Anchorage",
  hawaii: "Pacific/Honolulu",
};
const bed = {
  id: id(3), revisionId: id(4), revision: 1,
  geometry: {
    outer: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 3, y: 3 }, { x: 0, y: 6 }],
    exclusions: [[{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }]],
  },
};
const selection = { id: id(5), cropId: id(6), varietyId: null, method: "direct_sow" as const, quantity: 40, preferredBedId: null, bedRestriction: "soft" as const, priority: 0, revision: 1 };
const applicability = { methods: ["direct_sow" as const], regionIds: [], climateRegimes: [], hardinessZones: [], varietyIds: [] };
const spacing = { id: id(7), familyId: id(8), cropId: id(6), varietyId: null, ruleType: "spacing" as const, version: 1, applicability, payload: { state: "known" as const, type: "spacing" as const, withinRowMeters: { minimum: 1, maximum: 1, minimumInclusive: true, maximumInclusive: true }, pattern: "individual" as const, sourceUnit: "meters" }, publishedAt: new Date("2026-01-01"), evidenceIds: [id(9)] };

function plantingRule(frostFree: boolean) {
  return { id: id(11), familyId: id(12), cropId: id(6), varietyId: null, ruleType: "planting_window" as const, version: 1, applicability,
    payload: { state: "known" as const, type: "planting_window" as const, windows: frostFree
      ? [{ kind: "calendar" as const, startMonth: 10, startDay: 1, endMonth: 2, endDay: 15, endYearOffset: 1 }]
      : [{ kind: "anchor_offset" as const, anchor: "spring_last_freeze_32f" as const, startOffsetDays: -7, endOffsetDays: 14 }, { kind: "calendar" as const, startMonth: 10, startDay: 1, endMonth: 2, endDay: 15, endYearOffset: 1 }] },
    publishedAt: new Date("2026-01-01"), evidenceIds: [id(9)] };
}

describe("nationwide deterministic launch matrix", () => {
  it("produces explicit, deterministic results for every launch climate fixture", async () => {
    expect(representativeClimateRecords.map(({ externalId }) => externalId)).toEqual([
      "cold-continental-mn", "cool-maritime-wa", "hot-summer-tx", "arid-az", "high-elevation-co", "frost-free-fl", "alaska", "hawaii",
    ]);
    for (const [index, record] of representativeClimateRecords.entries()) {
      const frostFree = record.frostState === "frost_free";
      expect(timezones[record.externalId]).toBeTruthy();
      expect(frostFree ? [record.springFrostLocalDate, record.autumnFrostLocalDate] : [record.springFrostLocalDate, record.autumnFrostLocalDate].every(Boolean)).toEqual(frostFree ? [null, null] : true);
      const input = { gardenId: id(100 + index), gardenRevision: 1, timezone: timezones[record.externalId]!, seasonYear: 2028, catalogReleaseId: id(2), climate: { associationId: id(200 + index), version: 1, state: frostFree ? "frost_free" as const : "known" as const, hardinessZone: record.hardinessZone, springFrostLocalDate: record.springFrostLocalDate, autumnFrostLocalDate: record.autumnFrostLocalDate, source: "synthetic-launch-matrix" }, algorithmVersion: "grid-v1" as const, beds: [bed], selections: [selection], rules: [spacing, plantingRule(frostFree)] };
      const first = await generatePlan(input); const replay = await generatePlan(structuredClone(input));
      expect(replay).toEqual(first);
      expect(first.selections[0]!.placed).toBeGreaterThan(0);
      expect(first.selections[0]!.unplaced).toBeGreaterThan(0);
      expect(first.scheduleWindows.length).toBe(frostFree ? 1 : 2);
      expect(first.scheduleWindows.every(({ semantics }) => semantics.endsWith(timezones[record.externalId]!))).toBe(true);
      expect(first.unresolved.filter(({ kind }) => kind === "schedule")).toEqual([]);
    }
  });

  it("keeps cross-year, leap-day and daylight-saving boundaries as local calendar dates", async () => {
    const base = { gardenId: id(1), gardenRevision: 1, timezone: "America/New_York", seasonYear: 2028, catalogReleaseId: id(2), climate: { associationId: id(10), version: 1, state: "known" as const, hardinessZone: "7b", springFrostLocalDate: "03-12", autumnFrostLocalDate: "11-05", source: "matrix" }, algorithmVersion: "grid-v1" as const, beds: [bed], selections: [selection], rules: [spacing, plantingRule(false)] };
    const leap = await generatePlan(base);
    expect(leap.scheduleWindows.map(({ startLocalDate, endLocalDate }) => [startLocalDate, endLocalDate])).toContainEqual(["2028-10-01", "2029-02-15"]);
    expect(leap.scheduleWindows).toContainEqual(expect.objectContaining({ startLocalDate: "2028-03-05", endLocalDate: "2028-03-26", semantics: "anchor:spring_last_freeze_32f:America/New_York" }));
  });

  it("keeps difficult geometry measurable and safe across the antimeridian", () => {
    expect(validateBedGeometry(bed.geometry)).toEqual([]);
    expect(calibrationScale({ x: 0, y: 0 }, { x: 4, y: 0 }, 6)).toBe(1.5);
    const anchor = { latitude: 51.9, longitude: 179.95 }; const coordinate = { latitude: 51.9001, longitude: -179.95 };
    const projected = projectToLocal(coordinate, anchor);
    expect(Math.abs(projected.x)).toBeLessThan(8_000);
    expect(localToGeographic(projected, anchor)).toEqual(expect.objectContaining({ latitude: expect.closeTo(coordinate.latitude, 6), longitude: expect.closeTo(coordinate.longitude, 6) }));
  });

  it("labels unavailable and conflicting crop guidance instead of inventing an answer", async () => {
    const base = { gardenId: id(1), gardenRevision: 1, timezone: "Pacific/Honolulu", seasonYear: 2028, catalogReleaseId: id(2), climate: null, algorithmVersion: "grid-v1" as const, beds: [bed], selections: [selection], rules: [] };
    const missing = await generatePlan(base);
    expect(missing.selections[0]).toMatchObject({ placed: 0, unplaced: 40, reasonCodes: ["missing_spacing_rule"] });
    expect(missing.unresolved).toEqual(expect.arrayContaining([expect.objectContaining({ code: "missing_spacing_rule" }), expect.objectContaining({ code: "missing_planting_window_rule" })]));
    const conflict = await generatePlan({ ...base, rules: [spacing, { ...spacing, id: id(13), familyId: id(14) }] });
    expect(conflict.selections[0]).toMatchObject({ placed: 0, reasonCodes: ["conflicting_spacing_rules"] });
  });
});
