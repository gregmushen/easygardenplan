import { createDatabase, garden, gardenPlanVersion, gardenProgressEvent, notificationDeliveryIntent, notificationFeedEntry, organization, recommendationTransition, user, weatherForecastSnapshot } from "@easygardenplan/db";
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

  it("recovers an expired lease and keeps one idempotency key across provider retry", async () => {
    const leaseCandidate = { ...candidate, groupKey: "crop:lease", evidenceFingerprint: "fixture-lease" };
    const leaseWarning = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: leaseCandidate.groupKey, observation: { status: "evaluated", candidate: leaseCandidate } });
    const firstLease = new NotificationRepository(database!, organizationId, { now: () => new Date("2026-10-01T05:10:00.000Z") });
    const expiredClaim = await firstLease.claim(leaseWarning.transition!.id, 1_000);
    expect(expiredClaim).not.toBeNull();
    const recoveredLease = new NotificationRepository(database!, organizationId, { now: () => new Date("2026-10-01T05:10:02.000Z") });
    const recoveredClaim = await recoveredLease.claim(leaseWarning.transition!.id);
    expect(recoveredClaim).toMatchObject({ idempotencyKey: expiredClaim!.idempotencyKey });
    expect(recoveredClaim!.attemptToken).not.toBe(expiredClaim!.attemptToken);
    expect(await firstLease.accepted(expiredClaim!.intentId, expiredClaim!.attemptToken, "late-provider-receipt", new Date())).toBe(false);

    const retryCandidate = { ...candidate, groupKey: "crop:retry", evidenceFingerprint: "fixture-retry" };
    const retryWarning = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: retryCandidate.groupKey, observation: { status: "evaluated", candidate: retryCandidate } });
    const firstAttempt = await firstLease.claim(retryWarning.transition!.id);
    await firstLease.retry(firstAttempt!.intentId, firstAttempt!.attemptToken);
    const retriedAttempt = await firstLease.claim(retryWarning.transition!.id);
    expect(retriedAttempt).toMatchObject({ idempotencyKey: firstAttempt!.idempotencyKey });
    expect(retriedAttempt!.attemptToken).not.toBe(firstAttempt!.attemptToken);
  });

  it("suppresses a pending warning when every affected planting has ended", async () => {
    const selectionId = crypto.randomUUID();
    const completionCandidate = { ...candidate, groupKey: "crop:completed", affectedIds: [selectionId], evidenceFingerprint: "fixture-completed" };
    const warning = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: completionCandidate.groupKey, observation: { status: "evaluated", candidate: completionCandidate } });
    const [plan] = await database!.insert(gardenPlanVersion).values({ organizationId, gardenId, version: 99, state: "active", algorithmVersion: "grid-v1", inputFingerprint: "c".repeat(64), inputSnapshot: {}, result: {}, activatedAt: new Date() }).returning();
    await database!.insert(gardenProgressEvent).values({ organizationId, gardenId, planVersionId: plan!.id, selectionId, eventType: "removed", occurredLocalDate: "2026-10-01" });

    const deliveries = new NotificationRepository(database!, organizationId, { now: () => new Date("2026-10-01T05:01:00.000Z") });
    expect(await deliveries.claim(warning.transition!.id)).toBeNull();
    const [intent] = await database!.select().from(notificationDeliveryIntent).where(eq(notificationDeliveryIntent.transitionId, warning.transition!.id));
    expect(intent).toMatchObject({ status: "suppressed", suppressionReason: "affected_plantings_complete" });
  });
});
