import { climateDatasetManifestSchema, climateAssociationSchema, type ClimateDatasetManifest, type Coordinate } from "@easygardenplan/contracts";
import { climateAssociation, climateDatasetVersion, climateRecord, garden, type Database } from "@easygardenplan/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

export function distanceMeters(first: Coordinate, second: Coordinate): number {
  const radius = 6_371_008.8;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(second.latitude - first.latitude);
  let longitudeDelta = second.longitude - first.longitude;
  if (longitudeDelta > 180) longitudeDelta -= 360;
  if (longitudeDelta < -180) longitudeDelta += 360;
  const dLon = radians(longitudeDelta);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}

export class ClimateRepository {
  constructor(private readonly database: Database) {}

  async publishDataset(input: unknown): Promise<{ datasetVersionId: string; recordCount: number; rejectedCount: number }> {
    const manifest = climateDatasetManifestSchema.parse(input);
    if (await climateRecordsChecksum(manifest.records) !== manifest.checksumSha256) throw new Error("Climate dataset checksum does not match its normalized records");
    const externalIds = new Set(manifest.records.map(({ externalId }) => externalId));
    if (externalIds.size !== manifest.records.length) throw new Error("Climate dataset contains duplicate external IDs");
    return await this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`climate:${manifest.kind}`}))`);
      const [existing] = await transaction.select().from(climateDatasetVersion).where(and(eq(climateDatasetVersion.kind, manifest.kind), eq(climateDatasetVersion.sourceRelease, manifest.sourceRelease), eq(climateDatasetVersion.checksumSha256, manifest.checksumSha256))).limit(1);
      if (existing?.status === "published") return { datasetVersionId: existing.id, recordCount: existing.recordCount, rejectedCount: existing.rejectedCount };
      const dataset = existing ?? (await transaction.insert(climateDatasetVersion).values(datasetValues(manifest)).returning())[0];
      if (!dataset) throw new Error("Climate dataset version was not staged");
      if (!existing) await transaction.insert(climateRecord).values(manifest.records.map((record) => ({ datasetVersionId: dataset.id, externalId: record.externalId, latitude: String(record.coordinate.latitude), longitude: String(record.coordinate.longitude), elevationMeters: record.elevationMeters === null ? null : String(record.elevationMeters), hardinessZone: record.hardinessZone, frostState: record.frostState, springFrostLocalDate: record.springFrostLocalDate, autumnFrostLocalDate: record.autumnFrostLocalDate, referencePeriod: record.referencePeriod, probabilityPercent: record.probabilityPercent === null ? null : String(record.probabilityPercent) })));
      await transaction.update(climateDatasetVersion).set({ status: "published", recordCount: manifest.records.length, rejectedCount: 0, publishedAt: new Date() }).where(eq(climateDatasetVersion.id, dataset.id));
      return { datasetVersionId: dataset.id, recordCount: manifest.records.length, rejectedCount: 0 };
    });
  }

  async current(gardenId: string): Promise<unknown | null> {
    const [current] = await this.database.select().from(climateAssociation).where(and(eq(climateAssociation.gardenId, gardenId), eq(climateAssociation.active, true))).limit(1);
    if (!current) return null;
    return climateAssociationSchema.parse({ ...current, distanceMeters: current.distanceMeters === null ? null : Number(current.distanceMeters), elevationDifferenceMeters: current.elevationDifferenceMeters === null ? null : Number(current.elevationDifferenceMeters), confidence: Number(current.confidence) });
  }

  async associateGarden(input: { gardenId: string; coordinate: Coordinate; elevationMeters?: number | null; maxReliableDistanceMeters?: number }): Promise<unknown> {
    const [plot] = await this.database.select({ id: garden.id, organizationId: garden.organizationId }).from(garden).where(eq(garden.id, input.gardenId)).limit(1);
    if (!plot) throw new Error("Garden not found");
    const published = await this.database.select().from(climateDatasetVersion).where(eq(climateDatasetVersion.status, "published")).orderBy(desc(climateDatasetVersion.publishedAt), desc(climateDatasetVersion.createdAt), desc(climateDatasetVersion.id));
    const currentByKind = new Map<string, typeof published[number]>();
    for (const dataset of published) if (!currentByKind.has(dataset.kind)) currentByKind.set(dataset.kind, dataset);
    const combined = currentByKind.has("hardiness") || currentByKind.has("frost_normals") ? undefined : currentByKind.get("combined_fixture");
    const hardinessDataset = currentByKind.get("hardiness") ?? combined;
    const frostDataset = currentByKind.get("frost_normals") ?? combined;
    const selectedIds = [...new Set([hardinessDataset?.id, frostDataset?.id].filter((id): id is string => Boolean(id)))];
    const records = selectedIds.length ? await this.database.select().from(climateRecord).where(inArray(climateRecord.datasetVersionId, selectedIds)) : [];
    const nearestFor = (datasetId: string | undefined) => records
      .filter((record) => record.datasetVersionId === datasetId)
      .map((record) => ({ record, distance: distanceMeters(input.coordinate, { latitude: Number(record.latitude), longitude: Number(record.longitude) }) }))
      .sort((a, b) => a.distance - b.distance)[0];
    const hardiness = nearestFor(hardinessDataset?.id);
    const frost = frostDataset?.id === hardinessDataset?.id ? hardiness : nearestFor(frostDataset?.id);
    const maxReliable = input.maxReliableDistanceMeters ?? 75_000;
    const matchConfidence = (distance: number) => Math.max(0.1, 1 - distance / (maxReliable * 2));
    const evidenceFor = (dataset: typeof hardinessDataset, match: typeof hardiness) => dataset && match ? {
      kind: dataset.kind as "hardiness" | "frost_normals" | "combined_fixture", datasetVersionId: dataset.id, recordId: match.record.id,
      sourceName: dataset.sourceName, sourceRelease: dataset.sourceRelease, attribution: dataset.attribution, distanceMeters: match.distance,
      elevationDifferenceMeters: input.elevationMeters != null && match.record.elevationMeters != null ? Math.abs(input.elevationMeters - Number(match.record.elevationMeters)) : null,
      confidence: matchConfidence(match.distance),
    } : null;
    const sourceEvidence = [evidenceFor(hardinessDataset, hardiness), frostDataset?.id === hardinessDataset?.id ? null : evidenceFor(frostDataset, frost)].filter((value): value is NonNullable<typeof value> => value !== null);
    const hardinessReliable = Boolean(hardiness && hardiness.distance <= maxReliable);
    const frostReliable = Boolean(frost && frost.distance <= maxReliable);
    const state = !frost ? "unknown" : !frostReliable ? "uncertain" : frost.record.frostState;
    const confidence = sourceEvidence.length ? Math.min(...sourceEvidence.map((item) => item.confidence)) : 0;
    const primary = frost ?? hardiness;
    const elevationDifference = primary && input.elevationMeters != null && primary.record.elevationMeters != null ? Math.abs(input.elevationMeters - Number(primary.record.elevationMeters)) : null;
    const rationale = !primary ? "No published climate record is available" : [
      hardiness ? hardinessReliable ? `Hardiness matched ${Math.round(hardiness.distance / 1000)} km away` : `Hardiness source is ${Math.round(hardiness.distance / 1000)} km away and outside the reliable threshold` : "No hardiness source is published",
      frost ? frostReliable ? `frost normals matched ${Math.round(frost.distance / 1000)} km away` : `frost normals are ${Math.round(frost.distance / 1000)} km away and outside the reliable threshold` : "no frost-normal source is published",
    ].join("; ");
    return await this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`climate-association:${input.gardenId}`}))`);
      const [latest] = await transaction.select({ version: climateAssociation.version }).from(climateAssociation).where(eq(climateAssociation.gardenId, input.gardenId)).orderBy(desc(climateAssociation.version)).limit(1);
      await transaction.update(climateAssociation).set({ active: false }).where(and(eq(climateAssociation.gardenId, input.gardenId), eq(climateAssociation.active, true)));
      const [created] = await transaction.insert(climateAssociation).values({ organizationId: plot.organizationId, gardenId: plot.id, version: (latest?.version ?? 0) + 1, active: true, datasetVersionId: frostDataset?.id ?? hardinessDataset?.id, recordId: frost?.record.id ?? hardiness?.record.id, state, hardinessZone: hardinessReliable ? hardiness?.record.hardinessZone : null, springFrostLocalDate: state === "known" ? frost?.record.springFrostLocalDate : null, autumnFrostLocalDate: state === "known" ? frost?.record.autumnFrostLocalDate : null, distanceMeters: primary ? String(primary.distance) : null, elevationDifferenceMeters: elevationDifference === null ? null : String(elevationDifference), confidence: String(confidence), rationale, source: primary ? "dataset_match" : "unavailable", sourceEvidence }).returning();
      return climateAssociationSchema.parse({ ...created, distanceMeters: created?.distanceMeters === null ? null : Number(created?.distanceMeters), elevationDifferenceMeters: created?.elevationDifferenceMeters === null ? null : Number(created?.elevationDifferenceMeters), confidence: Number(created?.confidence) });
    });
  }

  async setUserAnchor(input: { gardenId: string; hardinessZone?: string | null; frostState: "known" | "frost_free" | "unknown"; springFrostLocalDate?: string | null; autumnFrostLocalDate?: string | null; rationale: string }): Promise<unknown> {
    const [plot] = await this.database.select({ id: garden.id, organizationId: garden.organizationId }).from(garden).where(eq(garden.id, input.gardenId)).limit(1);
    if (!plot) throw new Error("Garden not found");
    if (input.frostState === "known" && (!input.springFrostLocalDate || !input.autumnFrostLocalDate)) throw new Error("Known user anchors require both frost dates");
    return await this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`climate-association:${input.gardenId}`}))`);
      const [latest] = await transaction.select({ version: climateAssociation.version }).from(climateAssociation).where(eq(climateAssociation.gardenId, input.gardenId)).orderBy(desc(climateAssociation.version)).limit(1);
      await transaction.update(climateAssociation).set({ active: false }).where(and(eq(climateAssociation.gardenId, input.gardenId), eq(climateAssociation.active, true)));
      const [created] = await transaction.insert(climateAssociation).values({ organizationId: plot.organizationId, gardenId: plot.id, version: (latest?.version ?? 0) + 1, active: true, state: input.frostState, hardinessZone: input.hardinessZone, springFrostLocalDate: input.frostState === "known" ? input.springFrostLocalDate : null, autumnFrostLocalDate: input.frostState === "known" ? input.autumnFrostLocalDate : null, confidence: "1", rationale: input.rationale, source: "user_anchor" }).returning();
      return climateAssociationSchema.parse({ ...created, distanceMeters: null, elevationDifferenceMeters: null, confidence: Number(created?.confidence) });
    });
  }
}

export async function climateRecordsChecksum(records: ClimateDatasetManifest["records"]): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(records)));
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function datasetValues(manifest: ClimateDatasetManifest) {
  return { kind: manifest.kind, sourceName: manifest.sourceName, sourceRelease: manifest.sourceRelease, sourceUrl: manifest.sourceUrl, checksumSha256: manifest.checksumSha256, normalizationVersion: manifest.normalizationVersion, attribution: manifest.attribution, coverage: manifest.coverage, status: "staging", recordCount: 0, rejectedCount: 0 };
}
