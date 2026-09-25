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
let datasetId: string | undefined;

suite("versioned climate import and tenant association", () => {
  afterAll(async () => {
    await admin!.delete(organization).where(eq(organization.id, ids.organizationA));
    await admin!.delete(organization).where(eq(organization.id, ids.organizationB));
    await admin!.delete(user).where(eq(user.id, ids.userA));
    await admin!.delete(user).where(eq(user.id, ids.userB));
    if (datasetId) await admin!.delete(climateDatasetVersion).where(eq(climateDatasetVersion.id, datasetId));
    await admin!.$client.end();
  });

  it("publishes atomically, matches representative climates and enforces tenant isolation", async () => {
    const records = representativeClimateRecords.map((record) => ({ ...record, externalId: `${nonce}-${record.externalId}` }));
    const manifest = { kind: "combined_fixture" as const, sourceName: "Synthetic integration fixture", sourceRelease: nonce, sourceUrl: `https://example.test/${nonce}`, checksumSha256: await climateRecordsChecksum(records), normalizationVersion: 1, attribution: "Synthetic integration data", coverage: { fixture: true }, records };
    const first = await new ClimateRepository(admin!).publishDataset(manifest);
    datasetId = first.datasetVersionId;
    expect(first).toMatchObject({ recordCount: 8, rejectedCount: 0 });
    expect((await new ClimateRepository(admin!).publishDataset(manifest)).datasetVersionId).toBe(first.datasetVersionId);
    await expect(new ClimateRepository(admin!).publishDataset({ ...manifest, checksumSha256: "0".repeat(64) })).rejects.toThrow("checksum");

    await admin!.insert(user).values([{ id: ids.userA, name: "Climate A", email: `${ids.userA}@example.test`, emailVerified: true }, { id: ids.userB, name: "Climate B", email: `${ids.userB}@example.test`, emailVerified: true }]);
    await admin!.insert(organization).values([{ id: ids.organizationA, name: "Climate A", slug: ids.organizationA, createdAt: new Date(), householdOwnerUserId: ids.userA }, { id: ids.organizationB, name: "Climate B", slug: ids.organizationB, createdAt: new Date(), householdOwnerUserId: ids.userB }]);
    const [plot] = await admin!.insert(garden).values({ organizationId: ids.organizationA, name: "Seattle fixture", latitude: "47.61", longitude: "-122.33", timezone: "America/Los_Angeles", locationConfirmed: true }).returning();
    const tenantA = createTenantDatabase(connectionString!, "postgres-js", ids.organizationA);
    const tenantB = createTenantDatabase(connectionString!, "postgres-js", ids.organizationB);
    try {
      const match = await new ClimateRepository(tenantA).associateGarden({ gardenId: plot!.id, coordinate: { latitude: 47.61, longitude: -122.33 } });
      expect(match).toMatchObject({ source: "dataset_match", state: "known", hardinessZone: "9a", confidence: 1 });
      expect(await new ClimateRepository(tenantB).current(plot!.id)).toBeNull();
      await expect(new ClimateRepository(tenantB).setUserAnchor({ gardenId: plot!.id, frostState: "unknown", rationale: "cross tenant attempt" })).rejects.toThrow("Garden not found");
    } finally { await tenantA.$client.end(); await tenantB.$client.end(); }
  });
});
