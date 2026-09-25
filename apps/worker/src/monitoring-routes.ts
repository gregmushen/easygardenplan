import { Hono } from "hono";
import type { AuthEnvironment } from "@easygardenplan/auth";
import { MonitoringRepository } from "@easygardenplan/data";
import { weatherEvaluationRequestSchema } from "@easygardenplan/contracts";
import { weatherEvaluationRequestedEvent } from "@easygardenplan/events";
import type { AppVariables } from "./execution-context.js";
import { requireExecutionContext } from "./execution-context.js";
import { createEventPublisher } from "./events.js";
import { notificationPreference } from "@easygardenplan/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export const monitoringRoutes = new Hono<{ Bindings: AuthEnvironment; Variables: AppVariables }>();

monitoringRoutes.get("/api/gardens/:gardenId/monitoring", requireExecutionContext, async (context) => {
  const execution = context.get("execution"); execution.access.require({ permission: "garden.read" });
  const repository = new MonitoringRepository(execution.data, execution.tenant.organizationId, execution.clock);
  return context.json({ risk: await repository.listRisk(context.req.param("gardenId")), recommendations: await repository.listRecommendations(context.req.param("gardenId")), feed: await repository.listFeed(context.req.param("gardenId")) });
});

const preferenceSchema = z.object({ urgentEmailEnabled: z.boolean(), resolutionEmailEnabled: z.boolean(), quietHoursStart: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/u).nullable(), quietHoursEnd: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/u).nullable(), urgentDuringQuietHours: z.boolean() }).refine((value) => (value.quietHoursStart === null) === (value.quietHoursEnd === null), "Both quiet-hour times are required");

monitoringRoutes.get("/api/notifications/preferences", requireExecutionContext, async (context) => {
  const execution = context.get("execution");
  if (execution.principal.kind !== "user") return context.json({ error: "User session required" }, 403);
  const [stored] = await execution.data.select().from(notificationPreference).where(and(eq(notificationPreference.organizationId, execution.tenant.organizationId), eq(notificationPreference.userId, execution.principal.id))).limit(1);
  return context.json({ preference: stored ?? { urgentEmailEnabled: true, resolutionEmailEnabled: true, quietHoursStart: null, quietHoursEnd: null, urgentDuringQuietHours: true } });
});

monitoringRoutes.put("/api/notifications/preferences", requireExecutionContext, async (context) => {
  const execution = context.get("execution");
  if (execution.principal.kind !== "user") return context.json({ error: "User session required" }, 403);
  const parsed = preferenceSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Invalid notification preferences" }, 400);
  const values = { organizationId: execution.tenant.organizationId, userId: execution.principal.id, ...parsed.data, updatedAt: execution.clock.now() };
  const [preference] = await execution.data.insert(notificationPreference).values(values).onConflictDoUpdate({ target: [notificationPreference.organizationId, notificationPreference.userId], set: { ...parsed.data, updatedAt: execution.clock.now() } }).returning();
  return context.json({ preference });
});

monitoringRoutes.post("/api/gardens/:gardenId/monitoring/evaluations", requireExecutionContext, async (context) => {
  const execution = context.get("execution"); execution.access.require({ permission: "garden.write", entitlement: "weather.monitoring" });
  const parsed = weatherEvaluationRequestSchema.safeParse({ gardenId: context.req.param("gardenId"), reason: "manual", requestedAt: execution.clock.now().toISOString() });
  if (!parsed.success) return context.json({ error: "Invalid monitoring request" }, 400);
  const publisher = createEventPublisher({ organizationId: execution.tenant.organizationId, correlationId: execution.correlation.correlationId, clock: execution.clock });
  await execution.data.transaction(async (transaction) => { await transaction.execute(publisher.statement(weatherEvaluationRequestedEvent.name, parsed.data, { idempotencyKey: `weather-evaluation:${parsed.data.gardenId}:${parsed.data.requestedAt}` })); });
  return context.json({ state: "queued", requestedAt: parsed.data.requestedAt }, 202);
});
