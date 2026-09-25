import { garden, gardenProgressEvent, gardenRiskState, notificationDeliveryIntent, notificationDigest, notificationFeedEntry, notificationPreference, recommendationEpisode, recommendationTransition, recommendationVersion, user, type Database } from "@easygardenplan/db";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

export type ClaimedNotification = {
  intentId: string; attemptToken: string; idempotencyKey: string; recipient: string;
  gardenName: string; kind: string; action: string | null; validFrom: Date | null; validThrough: Date | null;
};

type PlantingProgress = {
  id: string;
  selectionId: string;
  eventType: string;
  supersedesEventId: string | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function affectedPlantingsComplete(affectedIds: unknown, events: PlantingProgress[]): boolean {
  if (!Array.isArray(affectedIds) || affectedIds.length === 0 || !affectedIds.every((id): id is string => typeof id === "string" && uuidPattern.test(id))) return false;
  const superseded = new Set(events.filter((event) => event.eventType === "correction" && event.supersedesEventId).map((event) => event.supersedesEventId!));
  const latest = new Map<string, PlantingProgress>();
  for (const event of events) {
    if (!latest.has(event.selectionId) && event.eventType !== "correction" && !superseded.has(event.id)) latest.set(event.selectionId, event);
  }
  return affectedIds.every((selectionId) => {
    const event = latest.get(selectionId);
    return event?.eventType === "removed" || event?.eventType === "harvested";
  });
}

function minuteOfDay(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour! * 60 + minute!;
}

export function isWithinQuietHours(now: Date, timezone: string, start: string | null | undefined, end: string | null | undefined): boolean {
  if (!start || !end) return false;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const local = Number(parts.find(({ type }) => type === "hour")?.value) * 60 + Number(parts.find(({ type }) => type === "minute")?.value);
  const startMinute = minuteOfDay(start); const endMinute = minuteOfDay(end);
  if (startMinute === endMinute) return true;
  return startMinute < endMinute ? local >= startMinute && local < endMinute : local >= startMinute || local < endMinute;
}

export function selectDigestRecommendationIds(entries: Array<{ recommendationVersionId: string; createdAt: Date }>, immediatelySentIds: ReadonlySet<string>, timezone: string, localDate: string): string[] {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const dateAt = (value: Date) => { const parts = formatter.formatToParts(value); return `${parts.find(({ type }) => type === "year")?.value}-${parts.find(({ type }) => type === "month")?.value}-${parts.find(({ type }) => type === "day")?.value}`; };
  return [...new Set(entries.filter(({ createdAt, recommendationVersionId }) => dateAt(createdAt) === localDate && !immediatelySentIds.has(recommendationVersionId)).map(({ recommendationVersionId }) => recommendationVersionId))].sort();
}

export class NotificationRepository {
  constructor(private readonly database: Database, private readonly organizationId: string, private readonly clock: { now(): Date } = { now: () => new Date() }) {}

  async claim(transitionId: string, leaseMilliseconds = 60_000): Promise<ClaimedNotification | null> {
    return await this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`notification:${transitionId}`}))`);
      const now = this.clock.now(); const token = crypto.randomUUID();
      const [claimed] = await transaction.update(notificationDeliveryIntent).set({ status: "sending", attemptToken: token, leaseExpiresAt: new Date(now.getTime() + leaseMilliseconds), updatedAt: now }).where(and(eq(notificationDeliveryIntent.organizationId, this.organizationId), eq(notificationDeliveryIntent.transitionId, transitionId), or(eq(notificationDeliveryIntent.status, "pending"), and(eq(notificationDeliveryIntent.status, "sending"), or(isNull(notificationDeliveryIntent.leaseExpiresAt), lt(notificationDeliveryIntent.leaseExpiresAt, now)))))).returning();
      if (!claimed) return null;
      const [details] = await transaction.select({ recipient: user.email, emailVerified: user.emailVerified, gardenName: garden.name, timezone: garden.timezone, kind: recommendationTransition.kind, action: recommendationVersion.action, affectedIds: recommendationVersion.affectedIds, validFrom: recommendationVersion.validFrom, validThrough: recommendationVersion.validThrough, transitionEpisodeId: recommendationTransition.episodeId, currentEpisodeId: gardenRiskState.episodeId, riskState: gardenRiskState.state }).from(notificationDeliveryIntent).innerJoin(user, eq(user.id, notificationDeliveryIntent.recipientUserId)).innerJoin(garden, and(eq(garden.organizationId, notificationDeliveryIntent.organizationId), eq(garden.id, notificationDeliveryIntent.gardenId))).innerJoin(recommendationTransition, and(eq(recommendationTransition.organizationId, notificationDeliveryIntent.organizationId), eq(recommendationTransition.id, notificationDeliveryIntent.transitionId))).innerJoin(recommendationVersion, and(eq(recommendationVersion.organizationId, notificationDeliveryIntent.organizationId), eq(recommendationVersion.id, notificationDeliveryIntent.recommendationVersionId))).innerJoin(recommendationEpisode, and(eq(recommendationEpisode.organizationId, notificationDeliveryIntent.organizationId), eq(recommendationEpisode.id, recommendationTransition.episodeId))).innerJoin(gardenRiskState, and(eq(gardenRiskState.organizationId, notificationDeliveryIntent.organizationId), eq(gardenRiskState.gardenId, notificationDeliveryIntent.gardenId), eq(gardenRiskState.hazard, recommendationEpisode.hazard), eq(gardenRiskState.groupKey, recommendationEpisode.groupKey))).where(eq(notificationDeliveryIntent.id, claimed.id)).limit(1);
      const [preference] = await transaction.select().from(notificationPreference).where(and(eq(notificationPreference.organizationId, this.organizationId), eq(notificationPreference.userId, claimed.recipientUserId))).limit(1);
      const enabled = details?.kind === "resolution" ? (preference?.resolutionEmailEnabled ?? true) : (preference?.urgentEmailEnabled ?? true);
      const current = details?.currentEpisodeId === details?.transitionEpisodeId && (details?.kind === "resolution" ? details.riskState === "resolved" : details?.riskState === "active");
      const rawAffectedIds = details?.affectedIds;
      const affectedIds = Array.isArray(rawAffectedIds) ? rawAffectedIds.filter((id): id is string => typeof id === "string" && uuidPattern.test(id)) : [];
      const progress = Array.isArray(rawAffectedIds) && affectedIds.length === rawAffectedIds.length && affectedIds.length > 0
        ? await transaction.select({ id: gardenProgressEvent.id, selectionId: gardenProgressEvent.selectionId, eventType: gardenProgressEvent.eventType, supersedesEventId: gardenProgressEvent.supersedesEventId }).from(gardenProgressEvent).where(and(eq(gardenProgressEvent.organizationId, this.organizationId), eq(gardenProgressEvent.gardenId, claimed.gardenId), inArray(gardenProgressEvent.selectionId, affectedIds))).orderBy(desc(gardenProgressEvent.createdAt))
        : [];
      const plantingsComplete = affectedPlantingsComplete(rawAffectedIds, progress);
      const quiet = details?.timezone ? isWithinQuietHours(now, details.timezone, preference?.quietHoursStart, preference?.quietHoursEnd) : false;
      const quietSuppressed = quiet && (details?.kind === "resolution" || !(preference?.urgentDuringQuietHours ?? true));
      if (!details?.emailVerified || !enabled || !current || plantingsComplete || quietSuppressed) {
        const suppressionReason = !details?.emailVerified ? "recipient_unverified" : !enabled ? "preference_disabled" : !current ? "recommendation_superseded" : plantingsComplete ? "affected_plantings_complete" : "quiet_hours";
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

  async createDigest(gardenId: string, recipientUserId: string, localDate: string) {
    return await this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`notification-digest:${gardenId}:${recipientUserId}:${localDate}`}))`);
      const [existing] = await transaction.select().from(notificationDigest).where(and(eq(notificationDigest.organizationId, this.organizationId), eq(notificationDigest.gardenId, gardenId), eq(notificationDigest.recipientUserId, recipientUserId), eq(notificationDigest.localDate, localDate))).limit(1);
      if (existing) return existing;
      const [place] = await transaction.select({ timezone: garden.timezone }).from(garden).where(and(eq(garden.organizationId, this.organizationId), eq(garden.id, gardenId))).limit(1);
      if (!place) throw new Error("Digest garden was not found");
      const [preference] = await transaction.select().from(notificationPreference).where(and(eq(notificationPreference.organizationId, this.organizationId), eq(notificationPreference.userId, recipientUserId))).limit(1);
      const entries = await transaction.select({ recommendationVersionId: notificationFeedEntry.recommendationVersionId, createdAt: notificationFeedEntry.createdAt }).from(notificationFeedEntry).where(and(eq(notificationFeedEntry.organizationId, this.organizationId), eq(notificationFeedEntry.gardenId, gardenId))).orderBy(notificationFeedEntry.createdAt);
      const sent = await transaction.select({ recommendationVersionId: notificationDeliveryIntent.recommendationVersionId }).from(notificationDeliveryIntent).where(and(eq(notificationDeliveryIntent.organizationId, this.organizationId), eq(notificationDeliveryIntent.gardenId, gardenId), eq(notificationDeliveryIntent.recipientUserId, recipientUserId), inArray(notificationDeliveryIntent.status, ["accepted", "delivered"])));
      const includedRecommendationVersionIds = selectDigestRecommendationIds(entries, new Set(sent.map(({ recommendationVersionId }) => recommendationVersionId)), place.timezone ?? "Etc/UTC", localDate);
      const enabled = (preference?.digestEmailEnabled ?? true) && (preference?.routineEmailEnabled ?? true);
      const now = this.clock.now();
      const [digest] = await transaction.insert(notificationDigest).values({ organizationId: this.organizationId, gardenId, recipientUserId, localDate, includedRecommendationVersionIds, idempotencyKey: `garden-digest:${gardenId}:${recipientUserId}:${localDate}`, status: enabled && includedRecommendationVersionIds.length ? "pending" : "suppressed", suppressionReason: enabled ? "empty_digest" : "preference_disabled", createdAt: now, updatedAt: now }).returning();
      if (!digest) throw new Error("Digest was not recorded");
      return digest;
    });
  }
}

export async function projectEmailDelivery(database: Database, event: { emailDeliveryId: string; status: "accepted" | "delivered" | "bounced" | "complained" | "failed"; occurredAt: Date }): Promise<number> {
  const terminal = ["bounced", "complained"];
  const allowedCurrent = event.status === "accepted" ? ["accepted", "sending"] : event.status === "delivered" ? ["accepted", "delivered"] : event.status === "failed" ? ["accepted", "failed"] : ["accepted", "delivered", "failed", ...terminal];
  const values = { status: event.status, updatedAt: event.occurredAt, ...(event.status === "delivered" ? { deliveredAt: event.occurredAt } : {}), ...(event.status === "failed" || terminal.includes(event.status) ? { failedAt: event.occurredAt } : {}) };
  const rows = await database.update(notificationDeliveryIntent).set(values).where(and(eq(notificationDeliveryIntent.providerDeliveryId, event.emailDeliveryId), inArray(notificationDeliveryIntent.status, allowedCurrent))).returning();
  return rows.length;
}
