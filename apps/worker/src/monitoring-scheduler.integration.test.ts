import { createDatabase, garden, organization, outboxMessage, weatherLocationDue } from "@easygardenplan/db";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scheduleDueWeatherEvaluations } from "./monitoring-scheduler.js";

const connectionString = process.env.TRESTLE_RLS_TEST_DATABASE_URL;
const suite = connectionString ? describe : describe.skip;
const database = connectionString ? createDatabase(connectionString, "postgres-js") : undefined;

suite("weather due scheduling", () => {
  const organizationId = `weather-scheduler-${crypto.randomUUID()}`; const gardenId = crypto.randomUUID(); const now = new Date("2026-10-01T05:00:00.000Z");
  beforeAll(async () => { await database!.insert(organization).values({ id: organizationId, name: "Scheduler fixture", slug: organizationId, createdAt: new Date() }); await database!.insert(garden).values({ id: gardenId, organizationId, name: "Due garden", latitude: "37", longitude: "-122", timezone: "America/Los_Angeles", locationConfirmed: true, monitoringEnabled: true }); await database!.insert(weatherLocationDue).values({ gardenId, organizationId, locationRevision: 1, nextDueAt: new Date(now.getTime() - 1) }); });
  afterAll(async () => { await database!.delete(outboxMessage).where(eq(outboxMessage.organizationId, organizationId)); await database!.delete(organization).where(eq(organization.id, organizationId)); await database!.$client.end(); });
  it("claims due work once and emits a tenant-provenanced committed event", async () => {
    const environment = { DATABASE_URL: connectionString!, DATABASE_DRIVER: "postgres-js" as const, BETTER_AUTH_SECRET: "test" };
    expect(await scheduleDueWeatherEvaluations(environment, { now: () => now })).toEqual({ claimed: 1, queued: 1, failed: 0 });
    expect(await scheduleDueWeatherEvaluations(environment, { now: () => now })).toEqual({ claimed: 0, queued: 0, failed: 0 });
    const rows = await database!.select().from(outboxMessage).where(and(eq(outboxMessage.organizationId, organizationId), eq(outboxMessage.eventName, "garden.weather_evaluation.requested")));
    expect(rows).toHaveLength(1); expect(rows[0]?.resourceId).toBe(gardenId);
  });
});
