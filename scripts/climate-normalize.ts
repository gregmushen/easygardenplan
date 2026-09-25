import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { climateDatasetManifestSchema, type ClimateRecordInput } from "../packages/contracts/src/index.js";
import { climateRecordsChecksum } from "../packages/data/src/climate-repository.js";
import { fileSha256, normalizeNoaaDirectory, normalizeUsdaXyz } from "./climate-normalization.js";

const run = promisify(execFile);
const [mode, outputArgument, ...sources] = process.argv.slice(2);
if (!mode || !outputArgument || sources.length === 0) throw new Error("Usage: climate-normalize <noaa-stations|usda-grid> <output.json> <source...>");
const output = resolve(outputArgument);
const scratch = await mkdtemp(join(tmpdir(), "easygardenplan-climate-"));

try {
  if (mode === "noaa-stations") {
    if (sources.length !== 1) throw new Error("NOAA normalization accepts one extracted directory or .tar.gz archive");
    const sourcePath = resolve(sources[0]!); let directory = sourcePath; let sourceArchiveSha256: string | undefined;
    if (directory.endsWith(".tar.gz")) { sourceArchiveSha256 = await fileSha256(sourcePath); directory = join(scratch, "noaa"); await run("mkdir", ["-p", directory]); await run("tar", ["-xzf", sourcePath, "-C", directory]); }
    const normalized = await normalizeNoaaDirectory(directory);
    const manifest = climateDatasetManifestSchema.parse({
      kind: "frost_normals", sourceName: "NOAA NCEI U.S. Climate Normals", sourceRelease: "1991-2020-v1.0.1",
      sourceUrl: "https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/", checksumSha256: await climateRecordsChecksum(normalized.records), normalizationVersion: 1,
      attribution: "NOAA National Centers for Environmental Information, U.S. Climate Normals 1991-2020 v1.0.1",
      coverage: { thresholdFahrenheit: 32, probabilityPercent: 50, accepted: normalized.records.length, rejected: normalized.rejected, ...(sourceArchiveSha256 ? { sourceArchiveSha256 } : {}), extractedFilesSha256: normalized.sourceSha256 }, records: normalized.records,
    });
    await writeFile(output, `${JSON.stringify(manifest)}\n`); process.stdout.write(`${JSON.stringify({ output, records: manifest.records.length, rejected: normalized.rejected, checksumSha256: manifest.checksumSha256 })}\n`);
  } else if (mode === "usda-grid") {
    const all: ClimateRecordInput[] = []; const sourceFiles: Array<{ region: string; archive: string; archiveSha256: string; normalizedSampleSha256: string; noDataOrUnsupportedCells: number }> = [];
    for (const source of sources) {
      const archive = resolve(source); const region = basename(source).match(/phzm_(us|ak|hi|pr)_grid_2023\.zip$/u)?.[1];
      if (!region) throw new Error(`Unrecognized USDA archive name: ${source}`);
      const directory = join(scratch, region); await run("mkdir", ["-p", directory]); await run("unzip", ["-q", archive, "-d", directory]);
      const bil = (await readdir(directory)).find((file) => file.endsWith(".bil")); if (!bil) throw new Error(`No BIL grid in ${source}`);
      const xyz = join(scratch, `${region}.xyz`); const percent = process.env.USDA_SAMPLE_PERCENT ?? "16.666667%";
      await run("gdal_translate", ["-q", "-of", "XYZ", "-r", "near", "-outsize", percent, percent, join(directory, bil), xyz]);
      const normalized = await normalizeUsdaXyz({ path: xyz, region }); for (const record of normalized.records) all.push(record); sourceFiles.push({ region, archive: basename(source), archiveSha256: await fileSha256(archive), normalizedSampleSha256: normalized.sourceSha256, noDataOrUnsupportedCells: normalized.rejected });
    }
    all.sort((left, right) => left.externalId.localeCompare(right.externalId));
    const manifest = climateDatasetManifestSchema.parse({
      kind: "hardiness", sourceName: "2023 USDA Plant Hardiness Zone Map GIS data, Oregon State University PRISM Climate Group", sourceRelease: "2023-1991-2020",
      sourceUrl: "https://prism.oregonstate.edu/phzm/", checksumSha256: await climateRecordsChecksum(all), normalizationVersion: 1,
      attribution: "USDA Agricultural Research Service and Oregon State University PRISM Climate Group; approximate transformed point sample, not the official USDA Plant Hardiness Zone Map",
      coverage: { samplingPercent: process.env.USDA_SAMPLE_PERCENT ?? "16.666667%", transformed: true, disclaimer: "Approximate transformed point sample; not the official USDA Plant Hardiness Zone Map", sourceFiles }, records: all,
    });
    await writeFile(output, `${JSON.stringify(manifest)}\n`); process.stdout.write(`${JSON.stringify({ output, records: manifest.records.length, checksumSha256: manifest.checksumSha256, sourceFiles })}\n`);
  } else throw new Error(`Unknown normalization mode: ${mode}`);
} finally { await rm(scratch, { recursive: true, force: true }); }
