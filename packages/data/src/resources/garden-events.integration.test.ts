import { garden, organization, createDatabase, createTenantDatabase } from "@easygardenplan/db";
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
    }
  });
});
