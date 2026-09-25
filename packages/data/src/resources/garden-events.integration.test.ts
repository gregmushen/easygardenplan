import { garden, organization, weatherLocationDue, createDatabase, createTenantDatabase } from "@easygardenplan/db";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { PostgresGardenRepository } from "./garden-repository.js";

const connectionString = process.env.TRESTLE_RLS_TEST_DATABASE_URL;
const suite = connectionString ? describe : describe.skip;

suite("Garden change-event atomicity", () => {
  it("rolls back update and delete when the event cannot be recorded", async () => {
    const organizationId = "event-" + crypto.randomUUID();
    const admin = createDatabase(connectionString!, "postgres-js");
    const tenant = createTenantDatabase(connectionString!, "postgres-js", organizationId);
    const repository = new PostgresGardenRepository(tenant, organizationId, {
      statement: () => sql`select 1 / 0`,
    });
    await admin.insert(organization).values({ id: organizationId, name: "Atomicity test", slug: organizationId, createdAt: new Date() });
    const [record] = await admin.insert(garden).values({ organizationId, name: "Update original" }).returning();
    const updateId = record!.id;
    try {
      await expect(repository.update(updateId, { name: "Update changed" })).rejects.toThrow("select 1 / 0");
      const [unchanged] = await admin.select().from(garden).where(eq(garden.id, updateId));
      expect(unchanged).toMatchObject({ name: "Update original", revision: 1 });
      await expect(repository.remove(updateId)).rejects.toThrow("select 1 / 0");
      const [undeleted] = await admin.select().from(garden).where(eq(garden.id, updateId));
      expect(undeleted).toMatchObject({ name: "Update original", revision: 1 });
    } finally {
      await admin.delete(organization).where(eq(organization.id, organizationId));
      await tenant.$client.end();
      await admin.$client.end();
    }
  });

  it("keeps the monitoring due index aligned with location and monitoring changes", async () => {
    const organizationId = "due-" + crypto.randomUUID();
    const admin = createDatabase(connectionString!, "postgres-js");
    const tenant = createTenantDatabase(connectionString!, "postgres-js", organizationId);
    const repository = new PostgresGardenRepository(tenant, organizationId, {
      statement: () => sql`select 1`,
    });
    await admin.insert(organization).values({ id: organizationId, name: "Due index test", slug: organizationId, createdAt: new Date() });
    try {
      const created = await repository.create({ name: "Back garden" });
      expect(await admin.select().from(weatherLocationDue).where(eq(weatherLocationDue.gardenId, created.id))).toHaveLength(0);

      const enabled = await repository.update(created.id, {
        latitude: "45.5152",
        longitude: "-122.6784",
        timezone: "America/Los_Angeles",
        locationSource: "manual_pin",
        locationConfirmed: true,
        monitoringEnabled: true,
      });
      expect(enabled?.revision).toBe(2);
      const [initialDue] = await admin.select().from(weatherLocationDue).where(eq(weatherLocationDue.gardenId, created.id));
      expect(initialDue).toMatchObject({ gardenId: created.id, organizationId, locationRevision: 2, leaseToken: null, leaseExpiresAt: null, failureCount: 0 });

      const leaseToken = crypto.randomUUID();
      await admin.update(weatherLocationDue).set({ leaseToken, leaseExpiresAt: new Date("2030-01-01T00:00:00Z"), failureCount: 3 }).where(eq(weatherLocationDue.gardenId, created.id));
      const relocated = await repository.update(created.id, { latitude: "47.6062", longitude: "-122.3321" });
      const [relocatedDue] = await admin.select().from(weatherLocationDue).where(eq(weatherLocationDue.gardenId, created.id));
      expect(relocated?.revision).toBe(3);
      expect(relocatedDue).toMatchObject({ locationRevision: 3, leaseToken: null, leaseExpiresAt: null, failureCount: 0 });

      await repository.update(created.id, { monitoringEnabled: false });
      expect(await admin.select().from(weatherLocationDue).where(eq(weatherLocationDue.gardenId, created.id))).toHaveLength(0);

      const reenabled = await repository.update(created.id, { monitoringEnabled: true });
      expect(reenabled?.revision).toBe(5);
      expect(await admin.select().from(weatherLocationDue).where(eq(weatherLocationDue.gardenId, created.id))).toHaveLength(1);
      expect(await repository.remove(created.id)).toBe(true);
      expect(await admin.select().from(weatherLocationDue).where(eq(weatherLocationDue.gardenId, created.id))).toHaveLength(0);
    } finally {
      await admin.delete(organization).where(eq(organization.id, organizationId));
      await tenant.$client.end();
      await admin.$client.end();
    }
  });
});
