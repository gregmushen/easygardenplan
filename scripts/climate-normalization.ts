import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { ClimateRecordInput } from "../packages/contracts/src/index.js";

export function parseCsvLine(line: string): string[] {
  const values: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { values.push(value.trim()); value = ""; }
    else value += character;
  }
  if (quoted) throw new Error("CSV row has an unterminated quoted field");
  values.push(value.trim());
  return values;
}

function monthDay(value: string | undefined): string | null {
  const match = value?.trim().match(/^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])$/u);
  return match ? `${match[1]}-${match[2]}` : null;
}

export function normalizeNoaaStation(headerLine: string, rowLine: string): ClimateRecordInput | null {
  const headers = parseCsvLine(headerLine); const values = parseCsvLine(rowLine);
  const row = new Map(headers.map((header, index) => [header, values[index]?.trim()]));
  const externalId = row.get("STATION"); const latitude = Number(row.get("LATITUDE")); const longitude = Number(row.get("LONGITUDE"));
  if (!externalId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const spring = monthDay(row.get("ANN-TMIN-PRBLST-T32FP50"));
  const autumn = monthDay(row.get("ANN-TMIN-PRBFST-T32FP50"));
  const occurrenceText = row.get("ANN-TMIN-PRBOCC-LSTH032")?.trim();
  const occurrence = occurrenceText ? Number(occurrenceText) : Number.NaN;
  const frostState = spring && autumn ? "known" as const : Number.isFinite(occurrence) && occurrence === 0 ? "frost_free" as const : null;
  if (!frostState) return null;
  const elevation = Number(row.get("ELEVATION"));
  return {
    externalId, coordinate: { latitude, longitude }, elevationMeters: Number.isFinite(elevation) ? elevation : null,
    hardinessZone: null, frostState, springFrostLocalDate: frostState === "known" ? spring : null,
    autumnFrostLocalDate: frostState === "known" ? autumn : null, referencePeriod: "1991-2020 NOAA Climate Normals v1.0.1", probabilityPercent: 50,
  };
}

export function hardinessZoneForFahrenheit(temperature: number): string | null {
  if (!Number.isFinite(temperature) || temperature < -60 || temperature >= 70) return null;
  const halfZone = Math.floor((temperature + 60) / 5);
  return `${Math.floor(halfZone / 2) + 1}${halfZone % 2 === 0 ? "a" : "b"}`;
}

export function wrapLongitude(longitude: number): number { return ((longitude + 180) % 360 + 360) % 360 - 180; }

export async function fileSha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export async function normalizeNoaaDirectory(directory: string): Promise<{ records: ClimateRecordInput[]; rejected: number; sourceSha256: string }> {
  const files = (await readdir(directory)).filter((file) => file.endsWith(".csv")).sort();
  const records: ClimateRecordInput[] = []; let rejected = 0; const sourceHash = createHash("sha256");
  for (const file of files) {
    const content = await readFile(join(directory, file), "utf8");
    sourceHash.update(file).update("\0").update(content).update("\0");
    const lines = content.split(/\r?\n/u).filter(Boolean);
    const normalized = lines.length >= 2 ? normalizeNoaaStation(lines[0]!, lines[1]!) : null;
    if (normalized) records.push(normalized); else rejected += 1;
  }
  records.sort((left, right) => left.externalId.localeCompare(right.externalId));
  return { records, rejected, sourceSha256: sourceHash.digest("hex") };
}

export async function normalizeUsdaXyz(input: { path: string; region: string }): Promise<{ records: ClimateRecordInput[]; rejected: number; sourceSha256: string }> {
  const records: ClimateRecordInput[] = []; let rejected = 0; const sourceHash = createHash("sha256");
  const lines = createInterface({ input: createReadStream(input.path), crlfDelay: Infinity });
  for await (const line of lines) {
    sourceHash.update(line).update("\n");
    const [longitudeText, latitudeText, temperatureText] = line.trim().split(/\s+/u);
    const rawLongitude = Number(longitudeText); const longitude = Number.isFinite(rawLongitude) ? wrapLongitude(rawLongitude) : rawLongitude; const latitude = Number(latitudeText); const temperature = Number(temperatureText);
    const zone = hardinessZoneForFahrenheit(temperature);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || temperature === -9999 || !zone) { rejected += 1; continue; }
    records.push({
      externalId: `${input.region}:${latitude.toFixed(6)}:${longitude.toFixed(6)}`, coordinate: { latitude, longitude }, elevationMeters: null,
      hardinessZone: zone, frostState: "unknown", springFrostLocalDate: null, autumnFrostLocalDate: null,
      referencePeriod: "1991-2020 USDA Plant Hardiness Zone Map (2023 release)", probabilityPercent: null,
    });
  }
  return { records, rejected, sourceSha256: sourceHash.digest("hex") };
}
