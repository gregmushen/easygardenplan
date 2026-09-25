import { describe, expect, it } from "vitest";
import { dimensionedBedSvg } from "./bed-repository.js";

describe("dimensioned bed print", () => {
  it("escapes labels, includes dimensions and excludes provider imagery", () => {
    const svg = dimensionedBedSvg("A < B & C", { outer: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }], exclusions: [] });
    expect(svg).toContain("A &lt; B &amp; C");
    expect(svg).toContain("2.00 m");
    expect(svg).not.toMatch(/https?:/u);
  });
});
