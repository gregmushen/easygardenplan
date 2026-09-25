import { garden, gardenRiskState, notificationDeliveryIntent, notificationPreference, recommendationEpisode, recommendationTransition, recommendationVersion, user, type Database } from "@easygardenplan/db";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

export type ClaimedNotification = {
  intentId: string; attemptToken: string; idempotencyKey: string; recipient: string;
  gardenName: string; kind: string; action: string | null; validFrom: Date | null; validThrough: Date | null;
};

export class NotificationRepository {
  constructor(private readonly database: Database, private readonly organizationId: string, private readonly clock: { now(): Date } = { now: () => new Date() }) {}

  async claim(transitionId: string, leaseMilliseconds = 60_000): Promise<ClaimedNotification | null> {
    return await this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`notification:${transitionId}`}))`);
      const now = this.clock.now(); const token = crypto.randomUUID();
      const [claimed] = await transaction.update(notificationDeliveryIntent).set({ status: "sending", attemptToken: token, leaseExpiresAt: new Date(now.getTime() + leaseMilliseconds), updatedAt: now }).where(and(eq(notificationDeliveryIntent.organizationId, this.organizationId), eq(notificationDeliveryIntent.transitionId, transitionId), or(eq(notificationDeliveryIntent.status, "pending"), and(eq(notificationDeliveryIntent.status, "sending"), or(isNull(notificationDeliveryIntent.leaseExpiresAt), lt(notificationDeliveryIntent.leaseExpiresAt, now)))))).returning();
      if (!claimed) return null;
      const [details] = await transaction.select({ recipient: user.email, emailVerified: user.emailVerified, gardenName: garden.name, kind: recommendationTransition.kind, action: recommendationVersion.action, validFrom: recommendationVersion.validFrom, validThrough: recommendationVersion.validThrough, transitionEpisodeId: recommendationTransition.episodeId, currentEpisodeId: gardenRiskState.episodeId, riskState: gardenRiskState.state }).from(notificationDeliveryIntent).innerJoin(user, eq(user.id, notificationDeliveryIntent.recipientUserId)).innerJoin(garden, and(eq(garden.organizationId, notificationDeliveryIntent.organizationId), eq(garden.id, notificationDeliveryIntent.gardenId))).innerJoin(recommendationTransition, and(eq(recommendationTransition.organizationId, notificationDeliveryIntent.organizationId), eq(recommendationTransition.id, notificationDeliveryIntent.transitionId))).innerJoin(recommendationVersion, and(eq(recommendationVersion.organizationId, notificationDeliveryIntent.organizationId), eq(recommendationVersion.id, notificationDeliveryIntent.recommendationVersionId))).innerJoin(recommendationEpisode, and(eq(recommendationEpisode.organizationId, notificationDeliveryIntent.organizationId), eq(recommendationEpisode.id, recommendationTransition.episodeId))).innerJoin(gardenRiskState, and(eq(gardenRiskState.organizationId, notificationDeliveryIntent.organizationId), eq(gardenRiskState.gardenId, notificationDeliveryIntent.gardenId), eq(gardenRiskState.hazard, recommendationEpisode.hazard), eq(gardenRiskState.groupKey, recommendationEpisode.groupKey))).where(eq(notificationDeliveryIntent.id, claimed.id)).limit(1);
      const [preference] = await transaction.select().from(notificationPreference).where(and(eq(notificationPreference.organizationId, this.organizationId), eq(notificationPreference.userId, claimed.recipientUserId))).limit(1);
      const enabled = details?.kind === "resolution" ? (preference?.resolutionEmailEnabled ?? true) : (preference?.urgentEmailEnabled ?? true);
      const current = details?.currentEpisodeId === details?.transitionEpisodeId && (details?.kind === "resolution" ? details.riskState === "resolved" : details?.riskState === "active");
      if (!details?.emailVerified || !enabled || !current) {
        const suppressionReason = !details?.emailVerified ? "recipient_unverified" : !enabled ? "preference_disabled" : "recommendation_superseded";
        await transaction.update(notificationDeliveryIntent).set({ status: "suppressed", suppressionReason, attemptToken: null, leaseExpiresAt: null, updatedAt: now }).where(and(eq(notificationDeliveryIntent.id, claimed.id), eq(notificationDeliveryIntent.attemptToken, token)));
        return null;
      }
      return { intentId: claimed.id, attemptToken: token, idempotencyKey: claimed.idempotencyKey, recipient: details.recipient, gardenName: details.gardenName, kind: details.kind, action: details.action, validFrom: details.validFrom, validThrough: details.validThrough };
    });
  }

  async accepted(intentId: string, attemptToken: string, providerDeliveryId: string, acceptedAt: Date): Promise<boolean> {
    const rows = await this.database.update(notificationDeliveryIntent).set({ status: "accepted", providerDeliveryId, acceptedAt, attemptToken: null, leaseExpiresAt: null, updatedAt: this.clock.now() }).where(and(eq(notificationDeliveryIntent.organizationId, this.organizationId), eq(notificationDeliveryIntent.id, intentId), eq(notificationDeliveryIntent.status, "sending"), eq(notificationDeliveryIntent.attemptToken, attemptToken))).returning();
    return rows.length === 1;
  }

  async retry(intentId: string, attemptToken: string): Promise<void> {
    await this.database.update(notificationDeliveryIntent).set({ status: "pending", attemptToken: null, leaseExpiresAt: null, updatedAt: this.clock.now() }).where(and(eq(notificationDeliveryIntent.organizationId, this.organizationId), eq(notificationDeliveryIntent.id, intentId), eq(notificationDeliveryIntent.status, "sending"), eq(notificationDeliveryIntent.attemptToken, attemptToken)));
  }
}

export async function projectEmailDelivery(database: Database, event: { emailDeliveryId: string; status: "accepted" | "delivered" | "bounced" | "complained" | "failed"; occurredAt: Date }): Promise<number> {
  const terminal = ["bounced", "complained"];
  const allowedCurrent = event.status === "accepted" ? ["accepted", "sending"] : event.status === "delivered" ? ["accepted", "delivered"] : event.status === "failed" ? ["accepted", "failed"] : ["accepted", "delivered", "failed", ...terminal];
  const values = { status: event.status, updatedAt: event.occurredAt, ...(event.status === "delivered" ? { deliveredAt: event.occurredAt } : {}), ...(event.status === "failed" || terminal.includes(event.status) ? { failedAt: event.occurredAt } : {}) };
  const rows = await database.update(notificationDeliveryIntent).set(values).where(and(eq(notificationDeliveryIntent.providerDeliveryId, event.emailDeliveryId), inArray(notificationDeliveryIntent.status, allowedCurrent))).returning();
  return rows.length;
}
