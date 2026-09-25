import { describe, expect, it } from "vitest";
import { normalizeClemsonPlanningChart } from "./catalog-source-normalization.js";

describe("Clemson planning chart normalization", () => {
  it("converts source inches, day ranges and transplant footnotes without widening regional scope", () => {
    const rows = Array.from({ length: 39 }, (_, index) => index === 0
      ? "| **Tomato\\*** | — | 60 x 24 | 4 | 70-80 |"
      : index === 1 ? "| **Asparagus** | — | 36 x 18 | 4 crowns | 2 years |"
      : `| **Crop ${index}** | 1 ounce | 30 x 2 | 1 | 50-60 |`).join("\n");
    const result = normalizeClemsonPlanningChart(`**Table 2. Vegetables Planting Chart**\n${rows}`);
    const tomato = result.candidates.filter(({ cropSlug }) => cropSlug === "tomato");
    expect(tomato).toHaveLength(2);
    expect(tomato[0]).toMatchObject({ methods: ["indoor_start", "purchased_start"], regionIds: ["us-sc"], payload: { withinRowMeters: { minimum: 0.6096 }, betweenRowMeters: { minimum: 1.524 } } });
    expect(tomato[1]).toMatchObject({ payload: { days: { minimum: 70, maximum: 80 }, anchor: "transplant" } });
    expect(result.omissions).toContainEqual(expect.objectContaining({ crop: "Asparagus", ruleType: "maturity" }));
  });
});
