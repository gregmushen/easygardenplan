import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { createDatabase, crop, ruleFamily, type DatabaseDriver } from "../packages/db/src/index.js";
import { KnowledgeRepository } from "../packages/data/src/knowledge-repository.js";

type Artifact = {
  schemaVersion: number;
  normalizationVersion: number;
  status: string;
  source: { url: string; title: string; publisher: string; sourceType: string; accessedAt: string; contentChecksumSha256: string };
  sources?: Record<string, { url: string; title: string; publisher: string; sourceType: string; accessedAt: string; contentChecksumSha256: string }>;
  scope: Record<string, unknown>;
  candidates: Array<{ sourceKey?: string; cropSlug: string; commonName: string; scientificName?: string; ruleType: string; methods: string[]; regionIds: string[]; payload: unknown; normalizedClaim: string; originalUnits: string; locator: string }>;
};

const path = process.argv[2];
if (!path) throw new Error("Usage: catalog-candidate-import <candidate JSON>");
const connectionString = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
if (process.env.APP_ENV === "production" && process.env.CATALOG_IMPORT_ALLOW_PRODUCTION !== "1") throw new Error("Production candidate import requires CATALOG_IMPORT_ALLOW_PRODUCTION=1");
const artifact = JSON.parse(await readFile(path, "utf8")) as Artifact;
if (artifact.schemaVersion !== 1 || artifact.normalizationVersion !== 1 || artifact.status !== "editorial_candidates" || (!artifact.source?.contentChecksumSha256 && !artifact.sources) || !Array.isArray(artifact.candidates)) throw new Error("Unsupported candidate artifact");

const database = createDatabase(connectionString, (process.env.DATABASE_DRIVER ?? "postgres-js") as DatabaseDriver);
const repository = new KnowledgeRepository(database);
let cropsCreated = 0;
let draftsCreated = 0;
let skipped = 0;

for (const candidate of artifact.candidates) {
  const source = candidate.sourceKey ? artifact.sources?.[candidate.sourceKey] : artifact.source;
  if (!source) throw new Error(`Candidate source was not found: ${candidate.sourceKey ?? "default"}`);
  const contextKey = `norm${artifact.normalizationVersion}-${source.contentChecksumSha256.slice(0, 24)}`;
  let [plant] = await database.select({ id: crop.id }).from(crop).where(eq(crop.slug, candidate.cropSlug)).limit(1);
  if (!plant) {
    [plant] = await database.insert(crop).values({ slug: candidate.cropSlug, commonName: candidate.commonName, scientificName: candidate.scientificName, status: "draft" }).onConflictDoNothing().returning();
    if (!plant) [plant] = await database.select({ id: crop.id }).from(crop).where(eq(crop.slug, candidate.cropSlug)).limit(1);
    if (!plant) throw new Error(`Could not create crop ${candidate.cropSlug}`);
    cropsCreated += 1;
  }
  for (const method of candidate.methods) {
    const [existing] = await database.select({ id: ruleFamily.id }).from(ruleFamily).where(and(eq(ruleFamily.cropId, plant.id), eq(ruleFamily.ruleType, candidate.ruleType), eq(ruleFamily.method, method), eq(ruleFamily.contextKey, contextKey))).limit(1);
    if (existing) { skipped += 1; continue; }
    await repository.createDraft({
      cropId: plant.id,
      ruleType: candidate.ruleType,
      method,
      contextKey,
      applicability: { methods: [method], regionIds: candidate.regionIds, climateRegimes: [], hardinessZones: [], varietyIds: [] },
      payload: candidate.payload,
      overridesRuleVersionIds: [],
      source: { url: source.url, title: source.title, publisher: source.publisher, sourceType: source.sourceType, accessedAt: new Date(source.accessedAt), contentChecksum: source.contentChecksumSha256, attributionNotes: "Imported as a source-scoped editorial candidate; publication requires separate accepted review." },
      evidence: { locator: candidate.locator, normalizedClaim: candidate.normalizedClaim, scope: { ...artifact.scope, methods: [method] }, originalUnits: candidate.originalUnits },
    });
    draftsCreated += 1;
  }
}

process.stdout.write(`${JSON.stringify({ cropsCreated, draftsCreated, skipped })}\n`);
