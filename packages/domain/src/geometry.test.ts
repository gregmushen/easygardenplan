import { describe, expect, it } from "vitest";
import { calibrationScale, localToGeographic, projectToLocal, signedArea, validateBedGeometry } from "./geometry.js";

describe("bed geometry", () => {
  it("round trips coordinates and wraps Alaska across the antimeridian", () => {
    const anchor = { latitude: 51.9, longitude: 179.95 };
    const coordinate = { latitude: 51.9001, longitude: -179.95 };
    const projected = projectToLocal(coordinate, anchor);
    expect(Math.abs(projected.x)).toBeLessThan(8_000);
    expect(localToGeographic(projected, anchor)).toEqual(expect.objectContaining({ latitude: expect.closeTo(coordinate.latitude, 6), longitude: expect.closeTo(coordinate.longitude, 6) }));
  });
  it("accepts a concave bed with a contained exclusion", () => {
    const geometry = { outer: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 3, y: 3 }, { x: 0, y: 6 }], exclusions: [[{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }]] };
    expect(validateBedGeometry(geometry)).toEqual([]);
    expect(Math.abs(signedArea(geometry.outer))).toBe(27);
  });
  it("rejects self intersections, outside exclusions and degenerate calibration", () => {
    expect(validateBedGeometry({ outer: [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 }], exclusions: [] })).toContain("Outer ring self-intersects");
    expect(validateBedGeometry({ outer: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }], exclusions: [[{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }]] })).toContain("Exclusion 1 is not contained in the outer ring");
    expect(() => calibrationScale({ x: 0, y: 0 }, { x: 0, y: 0 }, 2)).toThrow();
  });
});
