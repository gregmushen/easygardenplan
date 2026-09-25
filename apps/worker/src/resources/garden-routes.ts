import { type AuthEnvironment } from "@easygardenplan/auth";
import { gardenCreateSchema, gardenUpdateSchema } from "@easygardenplan/contracts";
import { PostgresGardenRepository } from "@easygardenplan/data";
import { GardenService } from "@easygardenplan/domain";
import { Hono } from "hono";

import { requireExecutionContext, type AppVariables } from "../execution-context.js";

export const gardenRoutes = new Hono<{ Bindings: AuthEnvironment; Variables: AppVariables }>();
gardenRoutes.use("/api/gardens", requireExecutionContext);
gardenRoutes.use("/api/gardens/*", requireExecutionContext);
function service(execution: AppVariables["execution"]) {
  return new GardenService(new PostgresGardenRepository(execution.data, execution.tenant.organizationId, execution.events));
}
async function operation<T>(execution: AppVariables["execution"], event: string, work: () => Promise<T>): Promise<T> {
  const started = execution.clock.now().getTime();
  execution.log.info(event + ".started");
  try {
    const result = await work();
    execution.log.info(event + ".completed", { durationMs: execution.clock.now().getTime() - started });
    return result;
  } catch (error) {
    execution.log.error(event + ".failed", { durationMs: execution.clock.now().getTime() - started, errorName: error instanceof Error ? error.name : "UnknownError" });
    throw error;
  }
}
gardenRoutes.get("/api/gardens", async (context) => {
  const execution = context.get("execution");
  execution.access.require({ permission: "garden.read" });
  const cursor = context.req.query("cursor");
  const requestedLimit = Number(context.req.query("limit") ?? "25");
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) return context.json({ error: "validation_failed", message: "limit must be between 1 and 100" }, 400);
  if (cursor && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(cursor)) return context.json({ error: "validation_failed", message: "cursor must be a UUID" }, 400);
  const page = await operation(execution, "resource.garden.list", () => service(execution).list({ ...(cursor ? { cursor } : {}), limit: requestedLimit }));
  return context.json({ gardens: page.items, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) });
});
gardenRoutes.post("/api/gardens", async (context) => {
  const parsed = gardenCreateSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  const execution = context.get("execution");
  execution.access.require({ permission: "garden.write" });
  return context.json({ garden: await operation(execution, "resource.garden.create", () => service(execution).create(parsed.data)) }, 201);
});
gardenRoutes.get("/api/gardens/:id", async (context) => {
  const execution = context.get("execution");
  execution.access.require({ permission: "garden.read" });
  const record = await operation(execution, "resource.garden.read", () => service(execution).get(context.req.param("id")));
  return record ? context.json({ garden: record }) : context.json({ error: "Not found" }, 404);
});
gardenRoutes.patch("/api/gardens/:id", async (context) => {
  const parsed = gardenUpdateSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  const execution = context.get("execution");
  execution.access.require({ permission: "garden.write" });
  const updated = await operation(execution, "resource.garden.update", () => service(execution).update(context.req.param("id"), parsed.data));
  return updated ? context.json({ garden: updated }) : context.json({ error: "Not found" }, 404);
});
gardenRoutes.delete("/api/gardens/:id", async (context) => {
  const execution = context.get("execution");
  execution.access.require({ permission: "garden.write" });
  return await operation(execution, "resource.garden.delete", () => service(execution).remove(context.req.param("id"))) ? context.body(null, 204) : context.json({ error: "Not found" }, 404);
});
