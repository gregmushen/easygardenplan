import { createDatabase, garden, notificationDeliveryIntent, notificationFeedEntry, organization, recommendationTransition, user, weatherForecastSnapshot } from "@easygardenplan/db";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MonitoringRepository } from "./monitoring-repository.js";
import { NotificationRepository, projectEmailDelivery } from "./notification-repository.js";

const connectionString = process.env.TRESTLE_RLS_TEST_DATABASE_URL;
const suite = connectionString ? describe : describe.skip;
const database = connectionString ? createDatabase(connectionString, "postgres-js") : undefined;

suite("weather episode persistence", () => {
  const nonce = crypto.randomUUID(); const organizationId = `monitoring-${nonce}`; const gardenId = crypto.randomUUID(); const userId = `monitoring-user-${nonce}`;
  const repository = database ? new MonitoringRepository(database, organizationId, { now: () => new Date("2026-10-01T05:00:00.000Z") }) : undefined;
  const candidate = { hazard: "cold" as const, groupKey: "crop:transplanted", action: "Cover the plants before the cold interval.", affectedIds: ["selection-1"], validFrom: "2026-10-01T06:00:00.000Z", validThrough: "2026-10-01T12:00:00.000Z", evidenceFingerprint: "fixture-a", minimumForecastCelsius: 0, thresholdCelsius: 2 };
  beforeAll(async () => { await database!.insert(user).values({ id: userId, name: "Monitoring owner", email: `${nonce}@example.test`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() }); await database!.insert(organization).values({ id: organizationId, name: "Monitoring fixture", slug: organizationId, householdOwnerUserId: userId, createdAt: new Date() }); await database!.insert(garden).values({ id: gardenId, organizationId, name: "Fixture garden", latitude: "37.774900", longitude: "-122.419400", timezone: "America/Los_Angeles", monitoringEnabled: true, locationConfirmed: true }); });
  afterAll(async () => { await database!.delete(organization).where(eq(organization.id, organizationId)); await database!.delete(user).where(eq(user.id, userId)); await database!.$client.end(); });

  it("serializes duplicate warnings, confirms resolution once and renews a later episode", async () => {
    const overlapping = await Promise.all([repository!.evaluate({ gardenId, hazard: "cold", groupKey: candidate.groupKey, observation: { status: "evaluated", candidate } }), repository!.evaluate({ gardenId, hazard: "cold", groupKey: candidate.groupKey, observation: { status: "evaluated", candidate } })]);
    expect(overlapping.filter(({ transition }) => transition?.kind === "warning")).toHaveLength(1);
    expect(await repository!.listRecommendations(gardenId)).toHaveLength(1);
    const [warningIntent] = await database!.select().from(notificationDeliveryIntent).where(and(eq(notificationDeliveryIntent.gardenId, gardenId), eq(notificationDeliveryIntent.status, "pending")));
    expect(warningIntent).toBeDefined();
    await database!.update(notificationDeliveryIntent).set({ status: "accepted", providerDeliveryId: "accepted-warning", acceptedAt: new Date(), updatedAt: new Date() }).where(eq(notificationDeliveryIntent.id, warningIntent!.id));
    const uncertain = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: candidate.groupKey, observation: { status: "stale" } });
    expect(uncertain.decision).toMatchObject({ nextState: "unknown", transition: null, retainActiveEpisode: true });
    const firstClear = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: candidate.groupKey, observation: { status: "evaluated" } });
    expect(firstClear.decision.transition).toBeNull();
    const resolved = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: candidate.groupKey, observation: { status: "evaluated" } });
    expect(resolved.transition?.kind).toBe("resolution");
    expect((await repository!.evaluate({ gardenId, hazard: "cold", groupKey: candidate.groupKey, observation: { status: "evaluated" } })).transition).toBeNull();
    const renewed = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: candidate.groupKey, observation: { status: "evaluated", candidate } });
    expect(renewed.transition?.kind).toBe("renewed_warning");
    expect(await database!.select().from(recommendationTransition).where(eq(recommendationTransition.gardenId, gardenId))).toHaveLength(3);
    expect(await database!.select().from(notificationFeedEntry).where(eq(notificationFeedEntry.gardenId, gardenId))).toHaveLength(3);
    expect(await database!.select().from(notificationDeliveryIntent).where(eq(notificationDeliveryIntent.gardenId, gardenId))).toHaveLength(3);
    const deliveries = new NotificationRepository(database!, organizationId, { now: () => new Date("2026-10-01T05:01:00.000Z") });
    const claims = await Promise.all([deliveries.claim(renewed.transition!.id), deliveries.claim(renewed.transition!.id)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const claim = claims.find(Boolean)!;
    expect(await deliveries.accepted(claim.intentId, crypto.randomUUID(), "wrong-token", new Date())).toBe(false);
    expect(await deliveries.accepted(claim.intentId, claim.attemptToken, "delivery-renewed", new Date())).toBe(true);
    await projectEmailDelivery(database!, { emailDeliveryId: "delivery-renewed", status: "delivered", occurredAt: new Date("2026-10-01T05:02:00.000Z") });
    await projectEmailDelivery(database!, { emailDeliveryId: "delivery-renewed", status: "accepted", occurredAt: new Date("2026-10-01T05:03:00.000Z") });
    const [projected] = await database!.select().from(notificationDeliveryIntent).where(eq(notificationDeliveryIntent.id, claim.intentId));
    expect(projected?.status).toBe("delivered");
  });

  it("deduplicates normalized shared forecast snapshots", async () => {
    const forecast = { provider: "nws" as const, sourceKey: "MTR/85,105", sourceUpdatedAt: "2026-10-01T04:00:00.000Z", retrievedAt: "2026-10-01T05:00:00.000Z", validFrom: "2026-10-01T06:00:00.000Z", validThrough: "2026-10-01T07:00:00.000Z", fingerprint: "a".repeat(64), normalizationVersion: 1 as const, intervals: [{ start: "2026-10-01T06:00:00.000Z", end: "2026-10-01T07:00:00.000Z", temperatureCelsius: 0 }] };
    const first = await repository!.storeForecast(forecast); const second = await repository!.storeForecast(forecast);
    expect(second.id).toBe(first.id);
    await database!.delete(weatherForecastSnapshot).where(eq(weatherForecastSnapshot.id, first.id));
  });
});
