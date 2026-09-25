import { createDatabase, crop, cropSelection, garden, gardenPlanVersion, gardenProgressEvent, notificationDeliveryIntent, notificationDigest, notificationDigestDue, notificationFeedEntry, notificationPreference, organization, planTask, recommendationTransition, taskStatusVersion, user, weatherForecastSnapshot, weatherOfficialAlertGarden, weatherOfficialAlertSnapshot } from "@easygardenplan/db";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MonitoringRepository } from "./monitoring-repository.js";
import { NotificationRepository, projectEmailDelivery } from "./notification-repository.js";

const connectionString = process.env.TRESTLE_RLS_TEST_DATABASE_URL;
const suite = connectionString ? describe : describe.skip;
const database = connectionString ? createDatabase(connectionString, "postgres-js") : undefined;

suite("weather episode persistence", () => {
  const nonce = crypto.randomUUID(); const organizationId = `monitoring-${nonce}`; const gardenId = crypto.randomUUID(); const userId = `monitoring-user-${nonce}`; const cropId = crypto.randomUUID(); const namedSelectionId = crypto.randomUUID();
  const repository = database ? new MonitoringRepository(database, organizationId, { now: () => new Date("2026-10-01T05:00:00.000Z") }) : undefined;
  const candidate = { hazard: "cold" as const, groupKey: "crop:transplanted", action: "Cover the plants before the cold interval.", affectedIds: ["selection-1"], validFrom: "2026-10-01T06:00:00.000Z", validThrough: "2026-10-01T12:00:00.000Z", evidenceFingerprint: "fixture-a", minimumForecastCelsius: 0, thresholdCelsius: 2 };
  beforeAll(async () => { await database!.insert(user).values({ id: userId, name: "Monitoring owner", email: `${nonce}@example.test`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() }); await database!.insert(organization).values({ id: organizationId, name: "Monitoring fixture", slug: organizationId, householdOwnerUserId: userId, createdAt: new Date() }); await database!.insert(garden).values({ id: gardenId, organizationId, name: "Fixture garden", latitude: "37.774900", longitude: "-122.419400", timezone: "America/Los_Angeles", monitoringEnabled: true, locationConfirmed: true }); await database!.insert(crop).values({ id: cropId, slug: `monitoring-tomato-${nonce}`, commonName: "Tomato", status: "published" }); await database!.insert(cropSelection).values({ id: namedSelectionId, organizationId, gardenId, cropId, method: "direct_sow", quantity: 2 }); });
  afterAll(async () => { await database!.delete(organization).where(eq(organization.id, organizationId)); await database!.delete(user).where(eq(user.id, userId)); await database!.delete(crop).where(eq(crop.id, cropId)); await database!.$client.end(); });

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

  it("retains normalized official cancellations and their point-matched garden", async () => {
    const alert = { provider: "nws" as const, providerAlertId: `cancel-${nonce}`, event: "Freeze Warning", status: "Actual", messageType: "Cancel", sentAt: "2026-10-01T04:30:00.000Z", effectiveAt: "2026-10-01T04:30:00.000Z", onsetAt: null, expiresAt: "2026-10-01T12:00:00.000Z", endsAt: "2026-10-01T05:00:00.000Z", cancelled: true, headline: "Freeze Warning cancelled", sourceUrl: `https://api.weather.gov/alerts/cancel-${nonce}`, areaDescription: "Fixture County" };
    const first = await repository!.storeOfficialAlerts(gardenId, [alert], new Date("2026-10-01T04:31:00.000Z"));
    const repeat = await repository!.storeOfficialAlerts(gardenId, [alert], new Date("2026-10-01T04:32:00.000Z"));
    expect(repeat[0]?.id).toBe(first[0]?.id);
    expect(first[0]).toMatchObject({ cancelled: true, messageType: "Cancel", areaDescription: "Fixture County" });
    expect(await database!.select().from(weatherOfficialAlertGarden).where(eq(weatherOfficialAlertGarden.alertSnapshotId, first[0]!.id))).toHaveLength(1);
    await database!.delete(weatherOfficialAlertGarden).where(eq(weatherOfficialAlertGarden.alertSnapshotId, first[0]!.id));
    await database!.delete(weatherOfficialAlertSnapshot).where(eq(weatherOfficialAlertSnapshot.id, first[0]!.id));
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

  it("suppresses task-specific advice when every identified task has ended", async () => {
    const selectionId = crypto.randomUUID(); const taskId = crypto.randomUUID();
    const [plan] = await database!.insert(gardenPlanVersion).values({ organizationId, gardenId, version: 100, state: "proposal", algorithmVersion: "grid-v1", inputFingerprint: "d".repeat(64), inputSnapshot: {}, result: {} }).returning();
    await database!.insert(planTask).values({ id: taskId, organizationId, gardenId, planVersionId: plan!.id, selectionId, taskType: "care", windowStartLocalDate: "2026-10-01", windowEndLocalDate: "2026-10-02", instruction: "Protect seedlings." });
    await database!.insert(taskStatusVersion).values({ organizationId, taskId, revision: 1, state: "planned", scheduledStartLocalDate: "2026-10-01", scheduledEndLocalDate: "2026-10-02" });
    const taskCandidate = { ...candidate, groupKey: "task:completed", affectedIds: [], affectedTaskIds: [taskId], evidenceFingerprint: "fixture-task-completed" };
    const warning = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: taskCandidate.groupKey, observation: { status: "evaluated", candidate: taskCandidate } });
    await database!.insert(taskStatusVersion).values({ organizationId, taskId, revision: 2, state: "completed", scheduledStartLocalDate: "2026-10-01", scheduledEndLocalDate: "2026-10-02", actualLocalDate: "2026-10-01" });
    const deliveries = new NotificationRepository(database!, organizationId, { now: () => new Date("2026-10-01T05:01:00.000Z") });
    expect(await deliveries.claim(warning.transition!.id)).toBeNull();
    const [intent] = await database!.select().from(notificationDeliveryIntent).where(eq(notificationDeliveryIntent.transitionId, warning.transition!.id));
    expect(intent).toMatchObject({ status: "suppressed", suppressionReason: "affected_tasks_complete" });
  });

  it("freezes one daily digest and excludes an immediately accepted version", async () => {
    const sentCandidate = { ...candidate, groupKey: "crop:digest-sent", evidenceFingerprint: "fixture-digest-sent" };
    const pendingCandidate = { ...candidate, groupKey: "crop:digest-pending", evidenceFingerprint: "fixture-digest-pending" };
    const sentWarning = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: sentCandidate.groupKey, observation: { status: "evaluated", candidate: sentCandidate } });
    const pendingWarning = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: pendingCandidate.groupKey, observation: { status: "evaluated", candidate: pendingCandidate } });
    const retainedCandidate = { ...candidate, groupKey: "crop:digest-retained", evidenceFingerprint: "fixture-digest-retained", action: "Water the covered seedlings after sunrise." };
    const retainedWarning = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: retainedCandidate.groupKey, observation: { status: "evaluated", candidate: retainedCandidate } });
    await database!.update(notificationDeliveryIntent).set({ status: "accepted", providerDeliveryId: "digest-sent", acceptedAt: new Date(), updatedAt: new Date() }).where(eq(notificationDeliveryIntent.transitionId, sentWarning.transition!.id));
    const digests = new NotificationRepository(database!, organizationId, { now: () => new Date("2026-10-01T14:00:00.000Z") });
    const created = await digests.createDigest(gardenId, userId, "2026-09-30");
    const repeated = await digests.createDigest(gardenId, userId, "2026-09-30");
    expect(repeated.id).toBe(created.id);
    expect(created.includedRecommendationVersionIds).toContain(pendingWarning.recommendation!.id);
    expect(created.includedRecommendationVersionIds).toContain(retainedWarning.recommendation!.id);
    expect(created.includedRecommendationVersionIds).not.toContain(sentWarning.recommendation!.id);
    expect(await database!.select().from(notificationDigest).where(eq(notificationDigest.id, created.id))).toHaveLength(1);
    await database!.update(notificationDeliveryIntent).set({ status: "accepted", providerDeliveryId: "digest-late-sent", acceptedAt: new Date(), updatedAt: new Date() }).where(eq(notificationDeliveryIntent.transitionId, pendingWarning.transition!.id));
    const claims = await Promise.all([digests.claimDigest(created.id), digests.claimDigest(created.id)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const claim = claims.find(Boolean)!;
    expect(claim.items.map(({ action }) => action)).toContain("Water the covered seedlings after sunrise.");
    expect(new Set(claim.items.map(({ action }) => action)).size).toBe(claim.items.length);
    const [rechecked] = await database!.select().from(notificationDigest).where(eq(notificationDigest.id, created.id));
    expect(rechecked?.includedRecommendationVersionIds).not.toContain(pendingWarning.recommendation!.id);
    expect(await digests.acceptDigest(claim.digestId, crypto.randomUUID(), "wrong-digest-token", new Date())).toBe(false);
    expect(await digests.acceptDigest(claim.digestId, claim.attemptToken, "digest-delivery", new Date())).toBe(true);
    expect(await projectEmailDelivery(database!, { emailDeliveryId: "digest-delivery", status: "delivered", occurredAt: new Date("2026-10-01T14:01:00.000Z") })).toBe(1);
    expect((await database!.select().from(notificationDigest).where(eq(notificationDigest.id, created.id)))[0]?.status).toBe("delivered");
    const [due] = await database!.select().from(notificationDigestDue).where(and(eq(notificationDigestDue.gardenId, gardenId), eq(notificationDigestDue.recipientUserId, userId), eq(notificationDigestDue.localDate, "2026-09-30")));
    expect(due?.dueAt.toISOString()).toBe("2026-10-01T14:00:00.000Z");
  });

  it("routes reviewed routine guidance to the digest instead of immediate email", async () => {
    await database!.insert(notificationPreference).values({ organizationId, userId, routineEmailEnabled: true, digestEmailEnabled: true }).onConflictDoUpdate({ target: [notificationPreference.organizationId, notificationPreference.userId], set: { routineEmailEnabled: true, digestEmailEnabled: true } });
    const routineClock = { now: () => new Date("2026-10-02T05:00:00.000Z") };
    const routineRepository = new MonitoringRepository(database!, organizationId, routineClock);
    const routineCandidate = { ...candidate, groupKey: "crop:routine", deliveryClass: "routine_digest" as const, action: "Review tomorrow's planting window before setting out seedlings.", evidenceFingerprint: "fixture-routine" };
    const routine = await routineRepository.evaluate({ gardenId, hazard: "cold", groupKey: routineCandidate.groupKey, observation: { status: "evaluated", candidate: routineCandidate } });
    const [intent] = await database!.select().from(notificationDeliveryIntent).where(eq(notificationDeliveryIntent.transitionId, routine.transition!.id));
    expect(intent).toMatchObject({ status: "suppressed", suppressionReason: "digest_only" });
    expect(routine.recommendation).toMatchObject({ deliveryClass: "routine_digest" });
    const delivery = new NotificationRepository(database!, organizationId, routineClock);
    const digest = await delivery.createDigest(gardenId, userId, "2026-10-01");
    expect(digest.includedRecommendationVersionIds).toContain(routine.recommendation!.id);
    const claim = await delivery.claimDigest(digest.id);
    expect(claim?.items.map(({ action }) => action)).toContain("Review tomorrow's planting window before setting out seedlings.");
    await delivery.retryDigest(claim!.digestId, claim!.attemptToken);
  });

  it("freezes affected crop names into the recommendation and immediate message", async () => {
    const namedCandidate = { ...candidate, groupKey: "crop:named", affectedIds: [namedSelectionId], action: "Cover before sunset.", evidenceFingerprint: "fixture-named" };
    const warning = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: namedCandidate.groupKey, observation: { status: "evaluated", candidate: namedCandidate } });
    expect(warning.recommendation?.affectedCropNames).toEqual(["Tomato"]);
    const delivery = new NotificationRepository(database!, organizationId, { now: () => new Date("2026-10-01T05:01:00.000Z") });
    const claim = await delivery.claim(warning.transition!.id);
    expect(claim?.cropNames).toEqual(["Tomato"]);
    await delivery.retry(claim!.intentId, claim!.attemptToken);
    const resolution = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: namedCandidate.groupKey, observation: { status: "evaluated" }, resolutionConfirmations: 1 });
    expect(resolution.recommendation).toMatchObject({ affectedIds: [namedSelectionId], affectedCropNames: ["Tomato"] });
  });

  it("suppresses overnight warnings when the recipient disabled urgent quiet-hour delivery", async () => {
    await database!.insert(notificationPreference).values({ organizationId, userId, urgentEmailEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "07:00", urgentDuringQuietHours: false }).onConflictDoUpdate({ target: [notificationPreference.organizationId, notificationPreference.userId], set: { urgentEmailEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "07:00", urgentDuringQuietHours: false } });
    const quietCandidate = { ...candidate, groupKey: "crop:quiet", evidenceFingerprint: "fixture-quiet" };
    const warning = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: quietCandidate.groupKey, observation: { status: "evaluated", candidate: quietCandidate } });
    const deliveries = new NotificationRepository(database!, organizationId, { now: () => new Date("2026-10-01T05:01:00.000Z") });
    expect(await deliveries.claim(warning.transition!.id)).toBeNull();
    const [intent] = await database!.select().from(notificationDeliveryIntent).where(eq(notificationDeliveryIntent.transitionId, warning.transition!.id));
    expect(intent).toMatchObject({ status: "suppressed", suppressionReason: "quiet_hours" });
    await database!.delete(notificationPreference).where(and(eq(notificationPreference.organizationId, organizationId), eq(notificationPreference.userId, userId)));
  });
});
