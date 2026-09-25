import { readFile } from "node:fs/promises";
import { climateDatasetManifestSchema, type ClimateDatasetManifest } from "../packages/contracts/src/index.js";
import { ClimateRepository, climateRecordsChecksum } from "../packages/data/src/climate-repository.js";
import { representativeClimateRecords } from "../packages/data/src/fixtures/representative-climate.js";
import { createDatabase } from "../packages/db/src/index.js";

const connectionString = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL is required");

async function fixture(): Promise<ClimateDatasetManifest> {
  return climateDatasetManifestSchema.parse({
    kind: "combined_fixture",
    sourceName: "Easy Garden Plan synthetic contract fixture",
    sourceRelease: "representative-v1",
    sourceUrl: "https://example.test/easygardenplan/representative-climate-fixture",
    checksumSha256: await climateRecordsChecksum(representativeClimateRecords),
    normalizationVersion: 1,
    attribution: "Synthetic test fixture; not USDA, OSU, NOAA, or horticultural guidance",
    coverage: { classes: ["cold_continental", "cool_maritime", "hot_summer", "arid", "high_elevation", "frost_free", "alaska", "hawaii"], productGuidance: false },
    records: representativeClimateRecords,
  });
}

const source = process.argv[2];
const manifest = source && source !== "--fixture" ? climateDatasetManifestSchema.parse(JSON.parse(await readFile(source, "utf8"))) : await fixture();
const database = createDatabase(connectionString, "postgres-js");
try {
  const result = await new ClimateRepository(database).publishDataset(manifest);
  process.stdout.write(`${JSON.stringify({ sourceRelease: manifest.sourceRelease, checksumSha256: manifest.checksumSha256, ...result })}\n`);
} finally { await database.$client.end(); }
