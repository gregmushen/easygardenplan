import { writeFile } from "node:fs/promises";
import { coverageMatrix } from "../packages/data/src/knowledge-repository.js";
import { representativeCropId, representativeRegionClasses, representativeRules } from "../packages/data/src/fixtures/representative-catalog.js";

const cells = coverageMatrix({ cropIds: [representativeCropId], methods: ["direct_sow", "indoor_start", "purchased_start"], ruleTypes: ["spacing", "light", "planting_window", "seed_start_lead", "maturity", "environmental_prerequisite", "support", "climate_response", "instruction"], regionClasses: representativeRegionClasses, rules: representativeRules });
const counts = { supported: 0, partial: 0, missing: 0, conflicted: 0 };
for (const { status } of cells) counts[status] += 1;
await writeFile(new URL("../docs/build/phase-02-coverage.json", import.meta.url), `${JSON.stringify({ schemaVersion: 1, fixture: "synthetic-contract-coverage", disclaimer: "This report exercises catalog shapes and is not horticultural coverage evidence.", dimensions: { crops: 1, methods: 3, ruleTypes: 9, regionClasses: representativeRegionClasses.length }, counts, cells }, null, 2)}\n`);
