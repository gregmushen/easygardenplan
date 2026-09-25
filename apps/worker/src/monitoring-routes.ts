import { Hono } from "hono";
import type { AuthEnvironment } from "@easygardenplan/auth";
import { MonitoringRepository } from "@easygardenplan/data";
import { weatherEvaluationRequestSchema } from "@easygardenplan/contracts";
import { weatherEvaluationRequestedEvent } from "@easygardenplan/events";
import type { AppVariables } from "./execution-context.js";
import { requireExecutionContext } from "./execution-context.js";
import { createEventPublisher } from "./events.js";

export const monitoringRoutes = new Hono<{ Bindings: AuthEnvironment; Variables: AppVariables }>();

monitoringRoutes.get("/api/gardens/:gardenId/monitoring", requireExecutionContext, async (context) => {
  const execution = context.get("execution"); execution.access.require({ permission: "garden.read" });
  const repository = new MonitoringRepository(execution.data, execution.tenant.organizationId, execution.clock);
  return context.json({ risk: await repository.listRisk(context.req.param("gardenId")), recommendations: await repository.listRecommendations(context.req.param("gardenId")) });
});

monitoringRoutes.post("/api/gardens/:gardenId/monitoring/evaluations", requireExecutionContext, async (context) => {
  const execution = context.get("execution"); execution.access.require({ permission: "garden.write", entitlement: "weather.monitoring" });
  const parsed = weatherEvaluationRequestSchema.safeParse({ gardenId: context.req.param("gardenId"), reason: "manual", requestedAt: execution.clock.now().toISOString() });
  if (!parsed.success) return context.json({ error: "Invalid monitoring request" }, 400);
  const publisher = createEventPublisher({ organizationId: execution.tenant.organizationId, correlationId: execution.correlation.correlationId, clock: execution.clock });
  await execution.data.transaction(async (transaction) => { await transaction.execute(publisher.statement(weatherEvaluationRequestedEvent.name, parsed.data, { idempotencyKey: `weather-evaluation:${parsed.data.gardenId}:${parsed.data.requestedAt}` })); });
  return context.json({ state: "queued", requestedAt: parsed.data.requestedAt }, 202);
});
