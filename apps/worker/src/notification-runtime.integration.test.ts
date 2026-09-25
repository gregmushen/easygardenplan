import { createLogger } from "@easygardenplan/context";
import { MonitoringRepository } from "@easygardenplan/data";
import { createDatabase, createTenantDatabase, garden, notificationDeliveryIntent, notificationPreference, organization, user, type Database } from "@easygardenplan/db";
import { clearCapturedEmails, listCapturedEmails } from "@easygardenplan/integrations";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { EventHandlerContext } from "./async-runtime.js";
import { handleRecommendationTransitioned } from "./notification-runtime.js";

const connectionString = process.env.TRESTLE_RLS_TEST_DATABASE_URL;
const suite = connectionString ? describe : describe.skip;
const database = connectionString ? createDatabase(connectionString, "postgres-js") : undefined;

suite("local recommendation delivery path", () => {
  const nonce = crypto.randomUUID(); const organizationId = `notify-${nonce}`; const gardenId = crypto.randomUUID(); const userId = `notify-user-${nonce}`;
  const now = new Date("2026-10-01T05:00:00.000Z"); const clock = { now: () => now };
  const repository = database ? new MonitoringRepository(database, organizationId, clock) : undefined;
  const tenantDatabase = connectionString ? createTenantDatabase(connectionString, "postgres-js", organizationId) : undefined;
  const candidate = { hazard: "cold" as const, groupKey: "tomato:transplanted", action: "Cover the tomatoes before the cold interval.", affectedIds: ["selection-1"], validFrom: "2026-10-01T06:00:00.000Z", validThrough: "2026-10-01T12:00:00.000Z", evidenceFingerprint: "launch-fixture", minimumForecastCelsius: 0, thresholdCelsius: 2 };

  beforeAll(async () => {
    clearCapturedEmails();
    await database!.insert(user).values({ id: userId, name: "Notification owner", email: `${nonce}@example.test`, emailVerified: true, createdAt: now, updatedAt: now });
    await database!.insert(organization).values({ id: organizationId, name: "Notification fixture", slug: organizationId, householdOwnerUserId: userId, createdAt: now });
    await database!.insert(garden).values({ id: gardenId, organizationId, name: "Cold-night garden", latitude: "44.980000", longitude: "-93.270000", timezone: "America/Chicago", monitoringEnabled: true, locationConfirmed: true });
  });
  afterAll(async () => { clearCapturedEmails(); await tenantDatabase!.$client.end(); await database!.delete(organization).where(eq(organization.id, organizationId)); await database!.delete(user).where(eq(user.id, userId)); await database!.$client.end(); });

  function context(transitionId: string): EventHandlerContext<Database> {
    return { event: { id: crypto.randomUUID(), name: "garden.recommendation.transitioned", schemaVersion: 1, occurredAt: now.toISOString(), resource: { type: "garden", id: gardenId }, correlationId: `launch-${nonce}`, idempotencyKey: `launch:${transitionId}`, payload: {} }, authority: "tenant", organizationId, data: tenantDatabase!, log: createLogger({ test: "notification-runtime" }), clock };
  }
  const payload = (result: Awaited<ReturnType<MonitoringRepository["evaluate"]>>) => ({ gardenId, episodeId: result.transition!.episodeId, recommendationVersionId: result.transition!.recommendationVersionId, transitionId: result.transition!.id, kind: result.transition!.kind as "warning" | "material_change" | "resolution" | "renewed_warning", riskRevision: result.decision.clearConfirmationCount + 1 });

  it("sends one warning, stays quiet while risk continues, then sends one resolution", async () => {
    const warning = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: candidate.groupKey, observation: { status: "evaluated", candidate } });
    expect(warning.transition?.kind).toBe("warning");
    await handleRecommendationTransitioned(payload(warning), {}, { DATABASE_URL: connectionString!, BETTER_AUTH_SECRET: "test-secret-at-least-32-characters", EMAIL_DELIVERY_MODE: "local", APP_ENV: "local" }, context(warning.transition!.id));
    await handleRecommendationTransitioned(payload(warning), {}, { DATABASE_URL: connectionString!, BETTER_AUTH_SECRET: "test-secret-at-least-32-characters", EMAIL_DELIVERY_MODE: "local", APP_ENV: "local" }, context(warning.transition!.id));
    expect(listCapturedEmails().filter(({ to }) => to.includes(`${nonce}@example.test`))).toHaveLength(1);

    const continuing = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: candidate.groupKey, observation: { status: "evaluated", candidate } });
    expect(continuing.transition).toBeNull();
    const stale = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: candidate.groupKey, observation: { status: "stale" } });
    expect(stale.decision).toMatchObject({ nextState: "unknown", transition: null, retainActiveEpisode: true });
    const pending = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: candidate.groupKey, observation: { status: "evaluated" } });
    expect(pending.transition).toBeNull();
    const resolution = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: candidate.groupKey, observation: { status: "evaluated" } });
    expect(resolution.transition?.kind).toBe("resolution");
    await handleRecommendationTransitioned(payload(resolution), {}, { DATABASE_URL: connectionString!, BETTER_AUTH_SECRET: "test-secret-at-least-32-characters", EMAIL_DELIVERY_MODE: "local", APP_ENV: "local" }, context(resolution.transition!.id));
    const messages = listCapturedEmails().filter(({ to }) => to.includes(`${nonce}@example.test`));
    expect(messages).toHaveLength(2);
    expect(messages.map(({ subject }) => subject).sort()).toEqual(["Weather risk cleared for Cold-night garden", "Weather update for Cold-night garden"]);
  });

  it("suppresses an obsolete warning and a preference-disabled warning immediately before send", async () => {
    const messagesBefore = listCapturedEmails().length;
    const obsoleteCandidate = { ...candidate, groupKey: "tomato:seedling", evidenceFingerprint: "obsolete-fixture" };
    const obsolete = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: obsoleteCandidate.groupKey, observation: { status: "evaluated", candidate: obsoleteCandidate } });
    await repository!.evaluate({ gardenId, hazard: "cold", groupKey: obsoleteCandidate.groupKey, observation: { status: "evaluated" }, resolutionConfirmations: 1 });
    await handleRecommendationTransitioned(payload(obsolete), {}, { DATABASE_URL: connectionString!, BETTER_AUTH_SECRET: "test-secret-at-least-32-characters", EMAIL_DELIVERY_MODE: "local", APP_ENV: "local" }, context(obsolete.transition!.id));
    const [obsoleteIntent] = await database!.select().from(notificationDeliveryIntent).where(and(eq(notificationDeliveryIntent.organizationId, organizationId), eq(notificationDeliveryIntent.transitionId, obsolete.transition!.id)));
    expect(obsoleteIntent).toMatchObject({ status: "suppressed", suppressionReason: "recommendation_superseded" });

    await database!.insert(notificationPreference).values({ organizationId, userId, urgentEmailEnabled: false, resolutionEmailEnabled: true }).onConflictDoUpdate({ target: [notificationPreference.organizationId, notificationPreference.userId], set: { urgentEmailEnabled: false } });
    const disabledCandidate = { ...candidate, groupKey: "pepper:transplanted", evidenceFingerprint: "disabled-fixture" };
    const disabled = await repository!.evaluate({ gardenId, hazard: "cold", groupKey: disabledCandidate.groupKey, observation: { status: "evaluated", candidate: disabledCandidate } });
    await handleRecommendationTransitioned(payload(disabled), {}, { DATABASE_URL: connectionString!, BETTER_AUTH_SECRET: "test-secret-at-least-32-characters", EMAIL_DELIVERY_MODE: "local", APP_ENV: "local" }, context(disabled.transition!.id));
    const [disabledIntent] = await database!.select().from(notificationDeliveryIntent).where(and(eq(notificationDeliveryIntent.organizationId, organizationId), eq(notificationDeliveryIntent.transitionId, disabled.transition!.id)));
    expect(disabledIntent).toMatchObject({ status: "suppressed", suppressionReason: "preference_disabled" });
    expect(listCapturedEmails()).toHaveLength(messagesBefore);
  });
});
