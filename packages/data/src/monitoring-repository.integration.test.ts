import { createDatabase, garden, organization, recommendationTransition, weatherForecastSnapshot } from "@easygardenplan/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MonitoringRepository } from "./monitoring-repository.js";

const connectionString = process.env.TRESTLE_RLS_TEST_DATABASE_URL;
const suite = connectionString ? describe : describe.skip;
const database = connectionString ? createDatabase(connectionString, "postgres-js") : undefined;

suite("weather episode persistence", () => {
  const nonce = crypto.randomUUID(); const organizationId = `monitoring-${nonce}`; const gardenId = crypto.randomUUID();
  const repository = database ? new MonitoringRepository(database, organizationId, { now: () => new Date("2026-10-01T05:00:00.000Z") }) : undefined;
  const candidate = { hazard: "cold" as const, groupKey: "crop:transplanted", action: "Cover the plants before the cold interval.", affectedIds: ["selection-1"], validFrom: "2026-10-01T06:00:00.000Z", validThrough: "2026-10-01T12:00:00.000Z", evidenceFingerprint: "fixture-a", minimumForecastCelsius: 0, thresholdCelsius: 2 };
  beforeAll(async () => { await database!.insert(organization).values({ id: organizationId, name: "Monitoring fixture", slug: organizationId, createdAt: new Date() }); await database!.insert(garden).values({ id: gardenId, organizationId, name: "Fixture garden", latitude: "37.774900", longitude: "-122.419400", timezone: "America/Los_Angeles", monitoringEnabled: true, locationConfirmed: true }); });
  afterAll(async () => { await database!.delete(organization).where(eq(organization.id, organizationId)); await database!.$client.end(); });

  it("serializes duplicate warnings, confirms resolution once and renews a later episode", async () => {
    const overlapping = await Promise.all([repository!.evaluate({ gardenId, hazard: "cold", groupKey: candidate.groupKey, observation: { status: "evaluated", candidate } }), repository!.evaluate({ gardenId, hazard: "cold", groupKey: candidate.groupKey, observation: { status: "evaluated", candidate } })]);
    expect(overlapping.filter(({ transition }) => transition?.kind === "warning")).toHaveLength(1);
    expect(await repository!.listRecommendations(gardenId)).toHaveLength(1);
    const uncertain = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: candidate.groupKey, observation: { status: "stale" } });
    expect(uncertain.decision).toMatchObject({ nextState: "unknown", transition: null, retainActiveEpisode: true });
    const firstClear = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: candidate.groupKey, observation: { status: "evaluated" } });
    expect(firstClear.decision.transition).toBeNull();
    const resolved = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: candidate.groupKey, observation: { status: "evaluated" } });
    expect(resolved.transition?.kind).toBe("resolution");
    expect((await repository!.evaluate({ gardenId, hazard: "cold", groupKey: candidate.groupKey, observation: { status: "evaluated" } })).transition).toBeNull();
    expect((await repository!.evaluate({ gardenId, hazard: "cold", groupKey: candidate.groupKey, observation: { status: "evaluated", candidate } })).transition?.kind).toBe("renewed_warning");
    expect(await database!.select().from(recommendationTransition).where(eq(recommendationTransition.gardenId, gardenId))).toHaveLength(3);
  });

  it("deduplicates normalized shared forecast snapshots", async () => {
    const forecast = { provider: "nws" as const, sourceKey: "MTR/85,105", sourceUpdatedAt: "2026-10-01T04:00:00.000Z", retrievedAt: "2026-10-01T05:00:00.000Z", validFrom: "2026-10-01T06:00:00.000Z", validThrough: "2026-10-01T07:00:00.000Z", fingerprint: "a".repeat(64), normalizationVersion: 1 as const, intervals: [{ start: "2026-10-01T06:00:00.000Z", end: "2026-10-01T07:00:00.000Z", temperatureCelsius: 0 }] };
    const first = await repository!.storeForecast(forecast); const second = await repository!.storeForecast(forecast);
    expect(second.id).toBe(first.id);
    await database!.delete(weatherForecastSnapshot).where(eq(weatherForecastSnapshot.id, first.id));
  });
});
