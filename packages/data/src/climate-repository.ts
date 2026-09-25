import { climateDatasetManifestSchema, climateAssociationSchema, type ClimateDatasetManifest, type Coordinate } from "@easygardenplan/contracts";
import { climateAssociation, climateDatasetVersion, climateRecord, garden, type Database } from "@easygardenplan/db";
import { and, desc, eq, sql } from "drizzle-orm";

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
    const [dataset] = await this.database.select().from(climateDatasetVersion).where(eq(climateDatasetVersion.status, "published")).orderBy(desc(climateDatasetVersion.publishedAt)).limit(1);
    const records = dataset ? await this.database.select().from(climateRecord).where(eq(climateRecord.datasetVersionId, dataset.id)) : [];
    const ranked = records.map((record) => ({ record, distance: distanceMeters(input.coordinate, { latitude: Number(record.latitude), longitude: Number(record.longitude) }) })).sort((a, b) => a.distance - b.distance);
    const nearest = ranked[0];
    const maxReliable = input.maxReliableDistanceMeters ?? 75_000;
    const state = !nearest ? "unknown" : nearest.distance > maxReliable ? "uncertain" : nearest.record.frostState;
    const confidence = !nearest ? 0 : Math.max(0.1, 1 - nearest.distance / (maxReliable * 2));
    const elevationDifference = nearest && input.elevationMeters != null && nearest.record.elevationMeters != null ? Math.abs(input.elevationMeters - Number(nearest.record.elevationMeters)) : null;
    const rationale = !nearest ? "No published climate record is available" : nearest.distance > maxReliable ? `Nearest climate record is ${Math.round(nearest.distance / 1000)} km away, beyond the reliable matching threshold` : `Matched nearest published climate record ${Math.round(nearest.distance / 1000)} km away`;
    return await this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`climate-association:${input.gardenId}`}))`);
      const [latest] = await transaction.select({ version: climateAssociation.version }).from(climateAssociation).where(eq(climateAssociation.gardenId, input.gardenId)).orderBy(desc(climateAssociation.version)).limit(1);
      await transaction.update(climateAssociation).set({ active: false }).where(and(eq(climateAssociation.gardenId, input.gardenId), eq(climateAssociation.active, true)));
      const [created] = await transaction.insert(climateAssociation).values({ organizationId: plot.organizationId, gardenId: plot.id, version: (latest?.version ?? 0) + 1, active: true, datasetVersionId: dataset?.id, recordId: nearest?.record.id, state, hardinessZone: state === "uncertain" ? null : nearest?.record.hardinessZone, springFrostLocalDate: state === "known" ? nearest?.record.springFrostLocalDate : null, autumnFrostLocalDate: state === "known" ? nearest?.record.autumnFrostLocalDate : null, distanceMeters: nearest ? String(nearest.distance) : null, elevationDifferenceMeters: elevationDifference === null ? null : String(elevationDifference), confidence: String(confidence), rationale, source: nearest ? "dataset_match" : "unavailable" }).returning();
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
