import { climateDatasetVersion, createDatabase, createTenantDatabase, garden, organization, user } from "@easygardenplan/db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { ClimateRepository, climateRecordsChecksum } from "./climate-repository.js";
import { representativeClimateRecords } from "./fixtures/representative-climate.js";

const connectionString = process.env.TRESTLE_RLS_TEST_DATABASE_URL;
const suite = connectionString ? describe : describe.skip;
const admin = connectionString ? createDatabase(connectionString, "postgres-js") : undefined;
const nonce = crypto.randomUUID();
const ids = { userA: `climate-a-${nonce}`, userB: `climate-b-${nonce}`, organizationA: `climate-a-${nonce}`, organizationB: `climate-b-${nonce}` };
const datasetIds: string[] = [];

suite("versioned climate import and tenant association", () => {
  afterAll(async () => {
    await admin!.delete(organization).where(eq(organization.id, ids.organizationA));
    await admin!.delete(organization).where(eq(organization.id, ids.organizationB));
    await admin!.delete(user).where(eq(user.id, ids.userA));
    await admin!.delete(user).where(eq(user.id, ids.userB));
    for (const datasetId of datasetIds) await admin!.delete(climateDatasetVersion).where(eq(climateDatasetVersion.id, datasetId));
    await admin!.$client.end();
  });

  it("publishes atomically, matches representative climates and enforces tenant isolation", async () => {
    const records = representativeClimateRecords.map((record) => ({ ...record, externalId: `${nonce}-${record.externalId}` }));
    const manifest = { kind: "combined_fixture" as const, sourceName: "Synthetic integration fixture", sourceRelease: nonce, sourceUrl: `https://example.test/${nonce}`, checksumSha256: await climateRecordsChecksum(records), normalizationVersion: 1, attribution: "Synthetic integration data", coverage: { fixture: true }, records };
    const first = await new ClimateRepository(admin!).publishDataset(manifest);
    datasetIds.push(first.datasetVersionId);
    expect(first).toMatchObject({ recordCount: 8, rejectedCount: 0 });
    expect((await new ClimateRepository(admin!).publishDataset(manifest)).datasetVersionId).toBe(first.datasetVersionId);
    await expect(new ClimateRepository(admin!).publishDataset({ ...manifest, checksumSha256: "0".repeat(64) })).rejects.toThrow("checksum");

    await admin!.insert(user).values([{ id: ids.userA, name: "Climate A", email: `${ids.userA}@example.test`, emailVerified: true }, { id: ids.userB, name: "Climate B", email: `${ids.userB}@example.test`, emailVerified: true }]);
    await admin!.insert(organization).values([{ id: ids.organizationA, name: "Climate A", slug: ids.organizationA, createdAt: new Date(), householdOwnerUserId: ids.userA }, { id: ids.organizationB, name: "Climate B", slug: ids.organizationB, createdAt: new Date(), householdOwnerUserId: ids.userB }]);
    const [plot] = await admin!.insert(garden).values({ organizationId: ids.organizationA, name: "Seattle fixture", latitude: "47.61", longitude: "-122.33", timezone: "America/Los_Angeles", locationConfirmed: true }).returning();
    const tenantA = createTenantDatabase(connectionString!, "postgres-js", ids.organizationA);
    const tenantB = createTenantDatabase(connectionString!, "postgres-js", ids.organizationB);
    try {
      const match = await new ClimateRepository(tenantA).associateGarden({ gardenId: plot!.id, coordinate: { latitude: 47.61, longitude: -122.33 }, datasetVersionIds: { combinedFixture: first.datasetVersionId } });
      expect(match).toMatchObject({ source: "dataset_match", state: "known", hardinessZone: "9a", confidence: 1, sourceEvidence: [expect.objectContaining({ kind: "combined_fixture", sourceRelease: nonce })] });

      const hardinessRecords = [{ ...records[1]!, externalId: `${nonce}-hardiness`, hardinessZone: "8b", frostState: "unknown" as const, springFrostLocalDate: null, autumnFrostLocalDate: null }];
      const frostRecords = [{ ...records[1]!, externalId: `${nonce}-frost`, hardinessZone: null, frostState: "known" as const, springFrostLocalDate: "03-20", autumnFrostLocalDate: "11-08" }];
      const hardinessDataset = await new ClimateRepository(admin!).publishDataset({ ...manifest, kind: "hardiness", sourceName: "USDA/OSU hardiness fixture", sourceRelease: `${nonce}-hardiness`, checksumSha256: await climateRecordsChecksum(hardinessRecords), attribution: "USDA/OSU fixture attribution", records: hardinessRecords });
      const frostDataset = await new ClimateRepository(admin!).publishDataset({ ...manifest, kind: "frost_normals", sourceName: "NOAA frost-normal fixture", sourceRelease: `${nonce}-frost`, checksumSha256: await climateRecordsChecksum(frostRecords), attribution: "NOAA fixture attribution", records: frostRecords });
      datasetIds.push(hardinessDataset.datasetVersionId, frostDataset.datasetVersionId);
      const combined = await new ClimateRepository(tenantA).associateGarden({ gardenId: plot!.id, coordinate: { latitude: 47.61, longitude: -122.33 }, datasetVersionIds: { hardiness: hardinessDataset.datasetVersionId, frostNormals: frostDataset.datasetVersionId } });
      expect(combined).toMatchObject({
        source: "dataset_match", state: "known", hardinessZone: "8b", springFrostLocalDate: "03-20", autumnFrostLocalDate: "11-08", confidence: 1,
        sourceEvidence: [
          expect.objectContaining({ kind: "hardiness", sourceName: "USDA/OSU hardiness fixture", attribution: "USDA/OSU fixture attribution" }),
          expect.objectContaining({ kind: "frost_normals", sourceName: "NOAA frost-normal fixture", attribution: "NOAA fixture attribution" }),
        ],
      });
      const wrappedFrostRecords = [{ ...frostRecords[0]!, externalId: `${nonce}-wrapped-frost`, coordinate: { latitude: 60, longitude: 179.8 }, springFrostLocalDate: "05-20", autumnFrostLocalDate: "09-10" }];
      const wrappedFrostDataset = await new ClimateRepository(admin!).publishDataset({ ...manifest, kind: "frost_normals", sourceName: "NOAA antimeridian fixture", sourceRelease: `${nonce}-wrapped-frost`, checksumSha256: await climateRecordsChecksum(wrappedFrostRecords), attribution: "NOAA fixture attribution", records: wrappedFrostRecords });
      datasetIds.push(wrappedFrostDataset.datasetVersionId);
      const wrapped = await new ClimateRepository(tenantA).associateGarden({ gardenId: plot!.id, coordinate: { latitude: 60, longitude: -179.9 }, datasetVersionIds: { hardiness: hardinessDataset.datasetVersionId, frostNormals: wrappedFrostDataset.datasetVersionId } });
      expect(wrapped).toMatchObject({ state: "known", springFrostLocalDate: "05-20", autumnFrostLocalDate: "09-10" });
      expect((wrapped as { sourceEvidence: Array<{ kind: string; distanceMeters: number }> }).sourceEvidence.find(({ kind }) => kind === "frost_normals")?.distanceMeters).toBeLessThan(20_000);
      expect(await new ClimateRepository(tenantB).current(plot!.id)).toBeNull();
      await expect(new ClimateRepository(tenantB).setUserAnchor({ gardenId: plot!.id, frostState: "unknown", rationale: "cross tenant attempt" })).rejects.toThrow("Garden not found");
    } finally { await tenantA.$client.end(); await tenantB.$client.end(); }
  });
});
