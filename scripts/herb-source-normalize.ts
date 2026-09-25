import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256 } from "./catalog-source-normalization.js";

type Method = "direct_sow" | "indoor_start" | "purchased_start";
type Herb = Readonly<{ key: string; file: string; url: string; title: string; commonName: string; scientificName: string; methods: readonly Method[]; spacing: [number, number]; spacingEvidence: string; lightHours?: number; seedLead?: [number, number] }>;
const herbs: readonly Herb[] = [
  { key: "basil", file: "extension.umn.edu-node-10256.md", url: "https://extension.umn.edu/node/10256", title: "Growing basil in home gardens", commonName: "Basil", scientificName: "Ocimum basilicum", methods: ["direct_sow", "indoor_start", "purchased_start"], spacing: [6, 12], spacingEvidence: "stand 6-12 inches apart", lightHours: 6, seedLead: [42, 56] },
  { key: "chives", file: "extension.umn.edu-node-10266.md", url: "https://extension.umn.edu/node/10266", title: "Growing chives in home gardens", commonName: "Chives", scientificName: "Allium schoenoprasum", methods: ["direct_sow", "purchased_start"], spacing: [6, 12], spacingEvidence: "Space plants 6 to 12 inches apart", lightHours: 6 },
  { key: "dill", file: "extension.umn.edu-node-10276.md", url: "https://extension.umn.edu/node/10276", title: "Growing dill in home gardens", commonName: "Dill", scientificName: "Anethum graveolens", methods: ["direct_sow"], spacing: [10, 12], spacingEvidence: "stand 10-12 inches apart", lightHours: 6 },
  { key: "horseradish", file: "extension.umn.edu-node-10281.md", url: "https://extension.umn.edu/node/10281", title: "Growing horseradish in home gardens", commonName: "Horseradish", scientificName: "Armoracia rusticana", methods: ["purchased_start"], spacing: [12, 12], spacingEvidence: "Space the sets one foot apart" },
  { key: "parsley", file: "extension.umn.edu-node-10286.md", url: "https://extension.umn.edu/node/10286", title: "Growing parsley in home gardens", commonName: "Parsley", scientificName: "Petroselinum crispum", methods: ["direct_sow", "indoor_start", "purchased_start"], spacing: [10, 12], spacingEvidence: "Final spacing should be 10 to 12 inches apart", lightHours: 6, seedLead: [42, 56] },
  { key: "sorrel", file: "extension.umn.edu-node-10291.md", url: "https://extension.umn.edu/node/10291", title: "Growing sorrel in home gardens", commonName: "Sorrel", scientificName: "Rumex scutatus / Rumex acetosa", methods: ["direct_sow", "indoor_start"], spacing: [12, 12], spacingEvidence: "Space mature plants at least a foot apart" },
];

const [directory, output] = process.argv.slice(2);
if (!directory || !output) throw new Error("Usage: herb-source-normalize <source directory> <output JSON>");
const sources: Record<string, unknown> = {};
const candidates: Array<Record<string, unknown>> = [];
const meters = (inches: number) => Number((inches * 0.0254).toFixed(4));
for (const herb of herbs) {
  const markdown = await readFile(join(directory, herb.file), "utf8");
  const [min, max] = herb.spacing;
  if (!markdown.includes(herb.spacingEvidence)) throw new Error(`${herb.commonName} spacing evidence was not found`);
  sources[herb.key] = { url: herb.url, title: herb.title, publisher: "University of Minnesota Extension", sourceType: "university_extension", accessedAt: "2026-09-25T00:00:00.000Z", contentChecksumSha256: sha256(markdown) };
  const common = { sourceKey: herb.key, cropSlug: herb.key, commonName: herb.commonName, scientificName: herb.scientificName, methods: herb.methods, regionIds: ["us-mn"], locator: "Planting/growing guidance" };
  candidates.push({ ...common, ruleType: "spacing", originalUnits: "inches", normalizedClaim: `${herb.commonName}: ${min}-${max} inches between mature plants.`, payload: { state: "known", type: "spacing", withinRowMeters: { minimum: meters(min), maximum: meters(max), minimumInclusive: true, maximumInclusive: true }, pattern: "individual", sourceUnit: "inches" } });
  candidates.push({ ...common, ruleType: "light", originalUnits: herb.lightHours ? "direct sun hours" : "source exposure", normalizedClaim: `${herb.commonName}: the source recommends full sun${herb.lightHours ? ` with at least ${herb.lightHours} hours of direct light` : ""}.`, payload: { state: "known", type: "light", exposures: ["full_sun"], ...(herb.lightHours ? { minimumDirectSunHours: herb.lightHours } : {}) } });
  if (herb.seedLead) candidates.push({ ...common, methods: ["indoor_start"], ruleType: "seed_start_lead", originalUnits: "weeks", normalizedClaim: `${herb.commonName}: start indoors ${herb.seedLead[0] / 7}-${herb.seedLead[1] / 7} weeks before transplanting outdoors.`, payload: { state: "known", type: "seed_start_lead", daysBeforeTransplant: { minimum: herb.seedLead[0], maximum: herb.seedLead[1], minimumInclusive: true, maximumInclusive: true } } });
}
const artifact = { schemaVersion: 1, normalizationVersion: 1, status: "editorial_candidates", disclaimer: "Source-scoped candidate facts require editorial review before catalog publication.", sources, scope: { regionIds: ["us-mn"] }, counts: { crops: herbs.length, candidates: candidates.length }, candidates };
await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(artifact.counts)}\n`);
