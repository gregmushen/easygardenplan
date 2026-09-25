import type { NormalizedForecast, NormalizedOfficialAlert } from "@easygardenplan/contracts";
import { garden, gardenRiskState, notificationDeliveryIntent, notificationDigestDue, notificationFeedEntry, notificationPreference, recommendationEpisode, recommendationTransition, recommendationVersion, weatherEvaluation, weatherForecastSnapshot, weatherOfficialAlertGarden, weatherOfficialAlertSnapshot, type Database } from "@easygardenplan/db";
import { decideRiskTransition, type RiskObservation } from "@easygardenplan/domain";
import { and, asc, desc, eq, inArray, max, sql, type SQL } from "drizzle-orm";
import { digestDueAt, localDateAt } from "./notification-repository.js";

export type TransitionEventFactory = (payload: { gardenId: string; episodeId: string; recommendationVersionId: string; transitionId: string; kind: "warning" | "material_change" | "resolution" | "renewed_warning"; riskRevision: number }) => SQL;

export class MonitoringRepository {
  constructor(private readonly database: Database, private readonly organizationId: string, private readonly clock: { now(): Date } = { now: () => new Date() }) {}

  async storeForecast(value: NormalizedForecast) {
    const inserted = await this.database.insert(weatherForecastSnapshot).values({ provider: value.provider, sourceKey: value.sourceKey, sourceUpdatedAt: new Date(value.sourceUpdatedAt), retrievedAt: new Date(value.retrievedAt), validFrom: new Date(value.validFrom), validThrough: new Date(value.validThrough), fingerprint: value.fingerprint, normalizationVersion: value.normalizationVersion, intervals: value.intervals }).onConflictDoNothing({ target: [weatherForecastSnapshot.provider, weatherForecastSnapshot.sourceKey, weatherForecastSnapshot.fingerprint] }).returning();
    if (inserted[0]) return inserted[0];
    const [existing] = await this.database.select().from(weatherForecastSnapshot).where(and(eq(weatherForecastSnapshot.provider, value.provider), eq(weatherForecastSnapshot.sourceKey, value.sourceKey), eq(weatherForecastSnapshot.fingerprint, value.fingerprint))).limit(1);
    if (!existing) throw new Error("Forecast snapshot identity was not recoverable");
    return existing;
  }

  async storeOfficialAlerts(gardenId: string, values: NormalizedOfficialAlert[], retrievedAt = this.clock.now()) {
    return await this.database.transaction(async (transaction) => {
      const stored = [];
      for (const value of values) {
        const rows = await transaction.insert(weatherOfficialAlertSnapshot).values({ provider: value.provider, providerAlertId: value.providerAlertId, event: value.event, status: value.status, messageType: value.messageType, sentAt: new Date(value.sentAt), effectiveAt: new Date(value.effectiveAt), onsetAt: value.onsetAt ? new Date(value.onsetAt) : null, expiresAt: new Date(value.expiresAt), endsAt: value.endsAt ? new Date(value.endsAt) : null, retrievedAt, cancelled: value.cancelled, headline: value.headline, sourceUrl: value.sourceUrl, areaDescription: value.areaDescription }).onConflictDoNothing({ target: [weatherOfficialAlertSnapshot.provider, weatherOfficialAlertSnapshot.providerAlertId, weatherOfficialAlertSnapshot.sentAt] }).returning();
        const [snapshot] = rows.length ? rows : await transaction.select().from(weatherOfficialAlertSnapshot).where(and(eq(weatherOfficialAlertSnapshot.provider, value.provider), eq(weatherOfficialAlertSnapshot.providerAlertId, value.providerAlertId), eq(weatherOfficialAlertSnapshot.sentAt, new Date(value.sentAt)))).limit(1);
        if (!snapshot) throw new Error("Official alert snapshot identity was not recoverable");
        await transaction.insert(weatherOfficialAlertGarden).values({ organizationId: this.organizationId, gardenId, alertSnapshotId: snapshot.id, matchedAt: retrievedAt }).onConflictDoNothing({ target: [weatherOfficialAlertGarden.gardenId, weatherOfficialAlertGarden.alertSnapshotId] });
        stored.push(snapshot);
      }
      return stored;
    });
  }

  async evaluate(input: { gardenId: string; hazard: "cold" | "heat" | "official_alert"; groupKey: string; observation: RiskObservation; snapshotId?: string; event?: TransitionEventFactory; resolutionConfirmations?: number }) {
    return await this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`garden-risk:${input.gardenId}:${input.hazard}:${input.groupKey}`}))`);
      const [previous] = await transaction.select().from(gardenRiskState).where(and(eq(gardenRiskState.organizationId, this.organizationId), eq(gardenRiskState.gardenId, input.gardenId), eq(gardenRiskState.hazard, input.hazard), eq(gardenRiskState.groupKey, input.groupKey))).limit(1);
      const now = this.clock.now();
      const newEpisodeId = crypto.randomUUID();
      const decision = decideRiskTransition(previous ? { state: previous.state as "unknown" | "clear" | "active" | "resolved", episodeId: previous.episodeId, actionFingerprint: previous.actionFingerprint, clearConfirmationCount: previous.clearConfirmationCount } : { state: "unknown", episodeId: null, actionFingerprint: null, clearConfirmationCount: 0 }, input.observation, { ...(input.resolutionConfirmations === undefined ? {} : { resolutionConfirmations: input.resolutionConfirmations }), newEpisodeId: () => newEpisodeId });
      const [evaluation] = await transaction.insert(weatherEvaluation).values({ organizationId: this.organizationId, gardenId: input.gardenId, hazard: input.hazard, groupKey: input.groupKey, status: input.observation.status, snapshotId: input.snapshotId, trace: input.observation, evaluatedAt: now }).returning();
      if (!evaluation) throw new Error("Weather evaluation was not recorded");
      const nextRevision = (previous?.revision ?? 0) + 1;
      if (decision.transition === "warning" || decision.transition === "renewed_warning") await transaction.insert(recommendationEpisode).values({ id: decision.episodeId!, organizationId: this.organizationId, gardenId: input.gardenId, hazard: input.hazard, groupKey: input.groupKey, status: "open", openedAt: now });
      if (decision.transition === "resolution" && decision.episodeId) await transaction.update(recommendationEpisode).set({ status: "resolved", resolvedAt: now }).where(and(eq(recommendationEpisode.organizationId, this.organizationId), eq(recommendationEpisode.id, decision.episodeId)));
      const riskValues = { organizationId: this.organizationId, gardenId: input.gardenId, hazard: input.hazard, groupKey: input.groupKey, state: decision.nextState, episodeId: decision.episodeId, actionFingerprint: decision.actionFingerprint, clearConfirmationCount: decision.clearConfirmationCount, supportingSnapshotId: input.snapshotId, lastEvaluatedAt: now, revision: nextRevision };
      if (previous) await transaction.update(gardenRiskState).set(riskValues).where(and(eq(gardenRiskState.organizationId, this.organizationId), eq(gardenRiskState.id, previous.id)));
      else await transaction.insert(gardenRiskState).values(riskValues);
      if (!decision.transition || !decision.episodeId) return { evaluation, decision, recommendation: null, transition: null };
      const [versionRow] = await transaction.select({ value: max(recommendationVersion.version) }).from(recommendationVersion).where(and(eq(recommendationVersion.organizationId, this.organizationId), eq(recommendationVersion.episodeId, decision.episodeId)));
      const priorVersion = versionRow?.value ?? 0;
      const candidate = input.observation.candidate;
      const [priorRecommendation] = candidate ? [] : await transaction.select({ deliveryClass: recommendationVersion.deliveryClass }).from(recommendationVersion).where(and(eq(recommendationVersion.organizationId, this.organizationId), eq(recommendationVersion.episodeId, decision.episodeId))).orderBy(desc(recommendationVersion.version)).limit(1);
      const deliveryClass = candidate?.deliveryClass ?? priorRecommendation?.deliveryClass ?? "urgent";
      const [recommendation] = await transaction.insert(recommendationVersion).values({ organizationId: this.organizationId, gardenId: input.gardenId, episodeId: decision.episodeId, version: priorVersion + 1, transitionKind: decision.transition, deliveryClass, action: candidate?.action ?? (decision.transition === "resolution" ? "The forecast risk for this period has passed." : null), affectedIds: candidate?.affectedIds ?? [], affectedTaskIds: candidate?.affectedTaskIds ?? [], validFrom: candidate ? new Date(candidate.validFrom) : null, validThrough: candidate ? new Date(candidate.validThrough) : null, evaluationId: evaluation.id, evidence: { snapshotId: input.snapshotId ?? null, observation: input.observation }, createdAt: now }).returning();
      if (!recommendation) throw new Error("Recommendation version was not recorded");
      const transitionId = crypto.randomUUID();
      const semanticKey = `${decision.episodeId}:${recommendation.version}:${decision.transition}`;
      const [transition] = await transaction.insert(recommendationTransition).values({ id: transitionId, organizationId: this.organizationId, gardenId: input.gardenId, episodeId: decision.episodeId, recommendationVersionId: recommendation.id, semanticKey, kind: decision.transition, createdAt: now }).returning();
      await transaction.insert(notificationFeedEntry).values({ organizationId: this.organizationId, gardenId: input.gardenId, transitionId, recommendationVersionId: recommendation.id, kind: decision.transition, createdAt: now });
      const recipientResult = await transaction.execute(sql`select user_id, email_verified from easygardenplan_household_recipient(${this.organizationId})`);
      const recipientRows = (Array.isArray(recipientResult) ? recipientResult : (recipientResult as { rows: unknown[] }).rows) as Array<Record<string, unknown>>;
      const recipient = recipientRows[0] ? { userId: String(recipientRows[0].user_id), emailVerified: Boolean(recipientRows[0].email_verified) } : undefined;
      if (recipient?.userId && recipient.emailVerified) {
        const [preference] = await transaction.select().from(notificationPreference).where(and(eq(notificationPreference.organizationId, this.organizationId), eq(notificationPreference.userId, recipient.userId))).limit(1);
        const enabled = deliveryClass === "routine_digest" ? (preference?.routineEmailEnabled ?? true) && (preference?.digestEmailEnabled ?? true) : decision.transition === "resolution" ? (preference?.resolutionEmailEnabled ?? true) : (preference?.urgentEmailEnabled ?? true);
        let warningWasSent = true;
        if (decision.transition === "resolution") {
          const [prior] = await transaction.select({ id: notificationDeliveryIntent.id }).from(notificationDeliveryIntent).innerJoin(recommendationTransition, eq(notificationDeliveryIntent.transitionId, recommendationTransition.id)).where(and(eq(notificationDeliveryIntent.organizationId, this.organizationId), eq(recommendationTransition.episodeId, decision.episodeId), inArray(recommendationTransition.kind, ["warning", "renewed_warning"]), inArray(notificationDeliveryIntent.status, ["accepted", "delivered"]), eq(notificationDeliveryIntent.recipientUserId, recipient.userId))).limit(1);
          warningWasSent = Boolean(prior);
        }
        const immediate = deliveryClass === "urgent";
        await transaction.insert(notificationDeliveryIntent).values({ organizationId: this.organizationId, gardenId: input.gardenId, transitionId, recommendationVersionId: recommendation.id, recipientUserId: recipient.userId, channel: "email", idempotencyKey: `recommendation-email:${transitionId}:${recipient.userId}`, status: enabled && warningWasSent && immediate ? "pending" : "suppressed", suppressionReason: !enabled ? "preference_disabled" : !immediate ? "digest_only" : "warning_not_delivered", createdAt: now, updatedAt: now });
        const [place] = await transaction.select({ timezone: garden.timezone }).from(garden).where(and(eq(garden.organizationId, this.organizationId), eq(garden.id, input.gardenId))).limit(1);
        const timezone = place?.timezone ?? "Etc/UTC";
        const localDate = localDateAt(now, timezone);
        await transaction.insert(notificationDigestDue).values({ organizationId: this.organizationId, gardenId: input.gardenId, recipientUserId: recipient.userId, localDate, dueAt: digestDueAt(localDate, timezone), updatedAt: now }).onConflictDoNothing({ target: [notificationDigestDue.gardenId, notificationDigestDue.recipientUserId, notificationDigestDue.localDate] });
      }
      if (input.event) await transaction.execute(input.event({ gardenId: input.gardenId, episodeId: decision.episodeId, recommendationVersionId: recommendation.id, transitionId, kind: decision.transition, riskRevision: nextRevision }));
      return { evaluation, decision, recommendation, transition: transition! };
    });
  }

  async listRisk(gardenId: string) { return await this.database.select().from(gardenRiskState).where(and(eq(gardenRiskState.organizationId, this.organizationId), eq(gardenRiskState.gardenId, gardenId))).orderBy(asc(gardenRiskState.hazard), asc(gardenRiskState.groupKey)); }
  async listRecommendations(gardenId: string) { return await this.database.select().from(recommendationVersion).where(and(eq(recommendationVersion.organizationId, this.organizationId), eq(recommendationVersion.gardenId, gardenId))).orderBy(desc(recommendationVersion.createdAt)); }
  async listFeed(gardenId: string) { return await this.database.select().from(notificationFeedEntry).where(and(eq(notificationFeedEntry.organizationId, this.organizationId), eq(notificationFeedEntry.gardenId, gardenId))).orderBy(desc(notificationFeedEntry.createdAt)); }
}
