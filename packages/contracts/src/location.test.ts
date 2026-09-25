import { describe, expect, it } from "vitest";
import { climateRecordSchema, confirmedLocationSchema, coordinateSchema } from "./location.js";

describe("location and climate contracts", () => {
  it("accepts Alaska and Hawaii coordinates and rejects longitude overflow", () => {
    expect(coordinateSchema.parse({ latitude: 64.2, longitude: -149.49 })).toBeTruthy();
    expect(coordinateSchema.parse({ latitude: 19.7, longitude: -155.1 })).toBeTruthy();
    expect(() => coordinateSchema.parse({ latitude: 0, longitude: 181 })).toThrow();
  });

  it("requires a valid timezone and provenance for a confirmed location", () => {
    expect(confirmedLocationSchema.parse({ coordinate: { latitude: 21.3, longitude: -157.8 }, timezone: "Pacific/Honolulu", source: "manual_pin" })).toBeTruthy();
    expect(() => confirmedLocationSchema.parse({ coordinate: { latitude: 40, longitude: -105 }, timezone: "Mountain/Imaginary", source: "manual_pin" })).toThrow();
    expect(() => confirmedLocationSchema.parse({ coordinate: { latitude: 40, longitude: -105 }, timezone: "America/Denver", source: "geocoded" })).toThrow();
  });

  it("keeps frost-free, unknown and dated frost values distinct", () => {
    const base = { externalId: "fixture", coordinate: { latitude: 25.7, longitude: -80.2 }, elevationMeters: 2, hardinessZone: "11b", referencePeriod: "1991-2020", probabilityPercent: 50 };
    expect(climateRecordSchema.parse({ ...base, frostState: "frost_free", springFrostLocalDate: null, autumnFrostLocalDate: null }).frostState).toBe("frost_free");
    expect(climateRecordSchema.parse({ ...base, frostState: "unknown", springFrostLocalDate: null, autumnFrostLocalDate: null }).frostState).toBe("unknown");
    expect(climateRecordSchema.parse({ ...base, frostState: "known", springFrostLocalDate: "04-15", autumnFrostLocalDate: "10-20" }).frostState).toBe("known");
    expect(() => climateRecordSchema.parse({ ...base, frostState: "known", springFrostLocalDate: null, autumnFrostLocalDate: null })).toThrow();
  });
});
