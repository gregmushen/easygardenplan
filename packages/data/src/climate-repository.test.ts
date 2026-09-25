import { describe, expect, it } from "vitest";
import { distanceMeters } from "./climate-repository.js";

describe("climate matching geometry", () => {
  it("uses short longitude distance across the antimeridian", () => {
    expect(distanceMeters({ latitude: 52, longitude: 179.9 }, { latitude: 52, longitude: -179.9 })).toBeLessThan(15_000);
  });

  it("returns zero for identical points", () => {
    expect(distanceMeters({ latitude: 21.31, longitude: -157.86 }, { latitude: 21.31, longitude: -157.86 })).toBe(0);
  });
});
