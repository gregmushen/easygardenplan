import type { AuthEnvironment } from "@easygardenplan/auth";
import { BedRepository, BedRevisionConflictError, dimensionedBedSvg, InvalidBedGeometryError } from "@easygardenplan/data";
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppVariables } from "./execution-context.js";

export const bedRoutes = new Hono<{ Bindings: AuthEnvironment; Variables: AppVariables }>();

bedRoutes.get("/api/gardens/:id/beds", async (context) => {
  const execution = context.get("execution"); execution.access.require({ permission: "garden.read" });
  return context.json({ beds: await new BedRepository(execution.data, execution.tenant.organizationId).list(context.req.param("id")) });
});

type BedEnvironment = { Bindings: AuthEnvironment; Variables: AppVariables };
async function save(context: Context<BedEnvironment>, bedId?: string) {
  const execution = context.get("execution"); execution.access.require({ permission: "garden.write" });
  try {
    const result = await new BedRepository(execution.data, execution.tenant.organizationId).save(context.req.param("id") ?? "", bedId, await context.req.json());
    return context.json(result, bedId ? 200 : 201);
  } catch (error) {
    if (error instanceof BedRevisionConflictError) return context.json({ error: "revision_conflict", message: error.message }, 409);
    if (error instanceof InvalidBedGeometryError) return context.json({ error: "invalid_geometry", issues: error.issues }, 400);
    if (error instanceof z.ZodError) return context.json({ error: "validation_failed", issues: error.issues }, 400);
    throw error;
  }
}
bedRoutes.post("/api/gardens/:id/beds", async (context) => await save(context));
bedRoutes.put("/api/gardens/:id/beds/:bedId", async (context) => await save(context, context.req.param("bedId")));
bedRoutes.get("/api/gardens/:id/beds/:bedId/history", async (context) => {
  const execution = context.get("execution"); execution.access.require({ permission: "garden.read" });
  return context.json({ revisions: await new BedRepository(execution.data, execution.tenant.organizationId).history(context.req.param("bedId")) });
});
bedRoutes.get("/api/gardens/:id/beds/:bedId/print.svg", async (context) => {
  const execution = context.get("execution"); execution.access.require({ permission: "garden.read" });
  const current = (await new BedRepository(execution.data, execution.tenant.organizationId).list(context.req.param("id"))).find(({ id }) => id === context.req.param("bedId"));
  if (!current) return context.json({ error: "not_found" }, 404);
  return context.body(dimensionedBedSvg(current.name, current.geometry as never), 200, { "content-type": "image/svg+xml", "content-disposition": `inline; filename="bed-${current.id}.svg"`, "cache-control": "private, no-store" });
});
