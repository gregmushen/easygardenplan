import { MonitoringRepository } from "@easygardenplan/data";
import { createDatabase, createTenantDatabase, garden, notificationDigest, notificationDigestDue, organization, user } from "@easygardenplan/db";
import { clearCapturedEmails, listCapturedEmails } from "@easygardenplan/integrations";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scheduleDueGardenDigests } from "./digest-scheduler.js";

const connectionString = process.env.TRESTLE_RLS_TEST_DATABASE_URL;
const suite = connectionString ? describe : describe.skip;
const database = connectionString ? createDatabase(connectionString, "postgres-js") : undefined;

suite("daily digest scheduling", () => {
  const nonce = crypto.randomUUID(); const organizationId = `digest-scheduler-${nonce}`; const gardenId = crypto.randomUUID(); const userId = `digest-user-${nonce}`;
  const observedAt = new Date("2026-03-08T08:30:00.000Z");
  beforeAll(async () => {
    clearCapturedEmails();
    await database!.insert(user).values({ id: userId, name: "Digest owner", email: `${nonce}@example.test`, emailVerified: true, createdAt: observedAt, updatedAt: observedAt });
    await database!.insert(organization).values({ id: organizationId, name: "Digest fixture", slug: organizationId, householdOwnerUserId: userId, createdAt: observedAt });
    await database!.insert(garden).values({ id: gardenId, organizationId, name: "DST Garden", latitude: "37", longitude: "-122", timezone: "America/Los_Angeles", locationConfirmed: true, monitoringEnabled: true });
    const repository = new MonitoringRepository(database!, organizationId, { now: () => observedAt });
    await repository.evaluate({ gardenId, hazard: "cold", groupKey: "crop:digest", observation: { status: "evaluated", candidate: { hazard: "cold", groupKey: "crop:digest", action: "Check the row cover before watering.", affectedIds: [], validFrom: "2026-03-08T10:00:00.000Z", validThrough: "2026-03-08T16:00:00.000Z", evidenceFingerprint: "digest-scheduler", minimumForecastCelsius: 0, thresholdCelsius: 2 } } });
  });
  afterAll(async () => { await database!.delete(organization).where(eq(organization.id, organizationId)); await database!.delete(user).where(eq(user.id, userId)); await database!.$client.end(); clearCapturedEmails(); });

  it("claims a DST-boundary local day once and sends with a durable identity", async () => {
    const environment = { DATABASE_URL: connectionString!, DATABASE_DRIVER: "postgres-js" as const, BETTER_AUTH_SECRET: "test", APP_ENV: "local" as const, EMAIL_DELIVERY_MODE: "local" as const };
    const due = new Date("2026-03-09T14:00:00.000Z");
    const results = await Promise.all([scheduleDueGardenDigests(environment, { now: () => due }), scheduleDueGardenDigests(environment, { now: () => due })]);
    expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ claimed: 1, delivered: 1, failed: 0 })]));
    expect(results.reduce((sum, result) => sum + result.delivered, 0)).toBe(1);
    expect(listCapturedEmails().filter(({ template }) => template === "garden-digest")).toHaveLength(1);
    const [digest] = await database!.select().from(notificationDigest).where(eq(notificationDigest.gardenId, gardenId));
    expect(digest).toMatchObject({ localDate: "2026-03-08", status: "accepted", idempotencyKey: `garden-digest:${gardenId}:${userId}:2026-03-08` });
    expect(await database!.select().from(notificationDigestDue).where(eq(notificationDigestDue.gardenId, gardenId))).toHaveLength(0);
  });

  it("does not let a tenant resolve another household's recipient", async () => {
    const tenant = createTenantDatabase(connectionString!, "postgres-js", organizationId);
    try {
      const own = await tenant.execute(sql`select user_id from easygardenplan_household_recipient(${organizationId})`);
      const other = await tenant.execute(sql`select user_id from easygardenplan_household_recipient(${`other-${nonce}`})`);
      expect(Array.isArray(own) ? own : own.rows).toHaveLength(1);
      expect(Array.isArray(other) ? other : other.rows).toHaveLength(0);
    } finally { await tenant.$client.end(); }
  });
});
