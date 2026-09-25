import type { AuthEnvironment } from "@easygardenplan/auth";
import { createPlatformDatabase, createTenantDatabase, weatherLocationDue } from "@easygardenplan/db";
import { weatherEvaluationRequestedEvent } from "@easygardenplan/events";
import { and, asc, eq, isNull, lt, lte, or } from "drizzle-orm";
import { createEventPublisher } from "./events.js";
import { weatherSchedulerBatchSize, weatherSchedulerConcurrency, weatherSchedulerRetryMinutes } from "./monitoring-capacity.js";

export async function scheduleDueWeatherEvaluations(environment: AuthEnvironment, clock: { now(): Date } = { now: () => new Date() }): Promise<{ claimed: number; queued: number; failed: number }> {
  const now = clock.now(); const platform = createPlatformDatabase(environment.DATABASE_URL, environment.DATABASE_DRIVER); const claimed: Array<{ gardenId: string; organizationId: string; locationRevision: number; failureCount: number; token: string }> = [];
  try {
    await platform.transaction(async (transaction) => {
      const rows = await transaction.select().from(weatherLocationDue).where(and(lte(weatherLocationDue.nextDueAt, now), or(isNull(weatherLocationDue.leaseExpiresAt), lt(weatherLocationDue.leaseExpiresAt, now)))).orderBy(asc(weatherLocationDue.nextDueAt)).limit(weatherSchedulerBatchSize).for("update", { skipLocked: true });
      for (const row of rows) { const token = crypto.randomUUID(); await transaction.update(weatherLocationDue).set({ leaseToken: token, leaseExpiresAt: new Date(now.getTime() + 5 * 60_000), updatedAt: now }).where(and(eq(weatherLocationDue.gardenId, row.gardenId), eq(weatherLocationDue.organizationId, row.organizationId))); claimed.push({ gardenId: row.gardenId, organizationId: row.organizationId, locationRevision: row.locationRevision, failureCount: row.failureCount, token }); }
    });
    let queued = 0; let failed = 0; const hour = now.toISOString().slice(0, 13);
    for (let index = 0; index < claimed.length; index += weatherSchedulerConcurrency) {
      const outcomes = await Promise.all(claimed.slice(index, index + weatherSchedulerConcurrency).map(async (item) => {
        try {
          const tenant = createTenantDatabase(environment.DATABASE_URL, environment.DATABASE_DRIVER, item.organizationId); const publisher = createEventPublisher({ organizationId: item.organizationId, correlationId: crypto.randomUUID(), clock });
          try { await tenant.transaction(async (transaction) => { await transaction.execute(publisher.statement(weatherEvaluationRequestedEvent.name, { gardenId: item.gardenId, reason: "scheduled", requestedAt: now.toISOString() }, { idempotencyKey: `weather-evaluation:${item.gardenId}:${item.locationRevision}:${hour}` })); }); } finally { await tenant.$client.end(); }
          await platform.update(weatherLocationDue).set({ nextDueAt: new Date(now.getTime() + 60 * 60_000), leaseToken: null, leaseExpiresAt: null, lastSucceededAt: now, failureCount: 0, updatedAt: now }).where(and(eq(weatherLocationDue.gardenId, item.gardenId), eq(weatherLocationDue.leaseToken, item.token)));
          return true;
        } catch {
          const failureCount = item.failureCount + 1;
          await platform.update(weatherLocationDue).set({ nextDueAt: new Date(now.getTime() + weatherSchedulerRetryMinutes(item.failureCount) * 60_000), leaseToken: null, leaseExpiresAt: null, failureCount, updatedAt: now }).where(and(eq(weatherLocationDue.gardenId, item.gardenId), eq(weatherLocationDue.leaseToken, item.token)));
          return false;
        }
      }));
      queued += outcomes.filter(Boolean).length;
      failed += outcomes.filter((outcome) => !outcome).length;
    }
    return { claimed: claimed.length, queued, failed };
  } finally { await platform.$client.end(); }
}
