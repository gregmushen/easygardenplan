import { readFile, writeFile } from "node:fs/promises";
import { normalizeClemsonPlanningChart, sha256 } from "./catalog-source-normalization.js";

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error("Usage: catalog-source-normalize <Clemson markdown> <output JSON>");
const markdown = await readFile(input, "utf8");
const normalized = normalizeClemsonPlanningChart(markdown);
const artifact = {
  schemaVersion: 1,
  normalizationVersion: 1,
  status: "editorial_candidates",
  disclaimer: "Source-scoped candidate facts require editorial review before catalog publication.",
  source: {
    url: "https://hgic.clemson.edu/factsheet/planning-a-garden/",
    title: "Planning a Garden",
    publisher: "Clemson Cooperative Extension Home & Garden Information Center",
    sourceType: "university_extension",
    accessedAt: "2026-09-25T00:00:00.000Z",
    contentChecksumSha256: sha256(markdown),
  },
  scope: { regionIds: ["us-sc"], sourceTable: "Table 2" },
  counts: { crops: new Set(normalized.candidates.map(({ cropSlug }) => cropSlug)).size, candidates: normalized.candidates.length, omissions: normalized.omissions.length },
  ...normalized,
};
await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(artifact.counts)}\n`);
