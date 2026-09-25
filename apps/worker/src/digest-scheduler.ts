import type { AuthEnvironment } from "@easygardenplan/auth";
import { NotificationRepository } from "@easygardenplan/data";
import { createPlatformDatabase, createTenantDatabase, notificationDigestDue } from "@easygardenplan/db";
import { createEmailService, gardenDigestTemplate } from "@easygardenplan/integrations";
import { and, asc, eq, isNull, lt, lte, or, sql } from "drizzle-orm";

type DueDigest = { id: string; organizationId: string; gardenId: string; recipientUserId: string; localDate: string; token: string };

export async function scheduleDueGardenDigests(environment: AuthEnvironment, clock: { now(): Date } = { now: () => new Date() }): Promise<{ claimed: number; delivered: number; suppressed: number; failed: number }> {
  const now = clock.now();
  const platform = createPlatformDatabase(environment.DATABASE_URL, environment.DATABASE_DRIVER);
  const claimed: DueDigest[] = [];
  try {
    await platform.transaction(async (transaction) => {
      const rows = await transaction.select().from(notificationDigestDue).where(and(lte(notificationDigestDue.dueAt, now), or(isNull(notificationDigestDue.leaseExpiresAt), lt(notificationDigestDue.leaseExpiresAt, now)))).orderBy(asc(notificationDigestDue.dueAt)).limit(50).for("update", { skipLocked: true });
      for (const row of rows) {
        const token = crypto.randomUUID();
        await transaction.update(notificationDigestDue).set({ leaseToken: token, leaseExpiresAt: new Date(now.getTime() + 5 * 60_000), updatedAt: now }).where(and(eq(notificationDigestDue.id, row.id), eq(notificationDigestDue.organizationId, row.organizationId)));
        claimed.push({ id: row.id, organizationId: row.organizationId, gardenId: row.gardenId, recipientUserId: row.recipientUserId, localDate: row.localDate, token });
      }
    });
    let delivered = 0; let suppressed = 0; let failed = 0;
    for (const item of claimed) {
      const tenant = createTenantDatabase(environment.DATABASE_URL, environment.DATABASE_DRIVER, item.organizationId);
      const repository = new NotificationRepository(tenant, item.organizationId, clock);
      let digestClaim: Awaited<ReturnType<NotificationRepository["claimDigest"]>> = null;
      try {
        const digest = await repository.createDigest(item.gardenId, item.recipientUserId, item.localDate);
        if (["accepted", "delivered", "suppressed"].includes(digest.status)) {
          await platform.delete(notificationDigestDue).where(and(eq(notificationDigestDue.id, item.id), eq(notificationDigestDue.leaseToken, item.token)));
          suppressed += digest.status === "suppressed" ? 1 : 0;
          continue;
        }
        digestClaim = await repository.claimDigest(digest.id);
        if (!digestClaim) throw new Error("Daily digest delivery is already leased");
        const email = createEmailService({
          mode: environment.EMAIL_DELIVERY_MODE === "provider" || environment.EMAIL_DELIVERY_MODE === "resend" ? "resend" : "local",
          environment: environment.APP_ENV ?? "local",
          ...(environment.RESEND_API_KEY ? { resendApiKey: environment.RESEND_API_KEY } : {}),
          ...(environment.EMAIL_FROM ? { from: environment.EMAIL_FROM } : {}),
          ...(environment.EMAIL_REPLY_TO ? { replyTo: environment.EMAIL_REPLY_TO } : {}),
          ...(environment.EMAIL_STAGING_REDIRECT ? { stagingRedirect: environment.EMAIL_STAGING_REDIRECT } : {}),
        });
        const receipt = await email.send({ to: digestClaim.recipient, subject: `Your garden plan for ${digestClaim.gardenName}`, template: gardenDigestTemplate({ gardenName: digestClaim.gardenName, localDate: digestClaim.localDate, actions: digestClaim.actions }) }, { idempotencyKey: digestClaim.idempotencyKey, correlationId: crypto.randomUUID(), organizationId: item.organizationId });
        if (!await repository.acceptDigest(digestClaim.digestId, digestClaim.attemptToken, receipt.id, receipt.acceptedAt)) throw new Error("Daily digest delivery lease was lost");
        await platform.delete(notificationDigestDue).where(and(eq(notificationDigestDue.id, item.id), eq(notificationDigestDue.leaseToken, item.token)));
        delivered++;
      } catch {
        if (digestClaim) await repository.retryDigest(digestClaim.digestId, digestClaim.attemptToken);
        await platform.update(notificationDigestDue).set({ dueAt: new Date(now.getTime() + 5 * 60_000), leaseToken: null, leaseExpiresAt: null, failureCount: sql`${notificationDigestDue.failureCount} + 1`, updatedAt: now }).where(and(eq(notificationDigestDue.id, item.id), eq(notificationDigestDue.leaseToken, item.token)));
        failed++;
      } finally {
        await tenant.$client.end();
      }
    }
    return { claimed: claimed.length, delivered, suppressed, failed };
  } finally {
    await platform.$client.end();
  }
}
