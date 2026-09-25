import type { AuthEnvironment } from "@easygardenplan/auth";
import { cropSelectionSchema } from "@easygardenplan/contracts";
import { PlanningConflictError, PlanningInputError, PlanningRepository } from "@easygardenplan/data";
import { Hono } from "hono";
import { z } from "zod";
import { requireExecutionContext, type AppVariables } from "./execution-context.js";

const selectionCommand = cropSelectionSchema.omit({ id: true, revision: true }).extend({ expectedRevision: z.number().int().nonnegative() }).strict();
const generationCommand = z.object({ seasonYear: z.number().int().min(2000).max(2200) }).strict();
const activationCommand = z.object({ acknowledgedLimitations: z.array(z.string().min(1)).max(100).default([]) }).strict();
const adjustmentCommand = z.object({ placementId: z.string().min(1), bedId: z.string().uuid(), position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict() }).strict();

export const planningRoutes = new Hono<{ Bindings: AuthEnvironment; Variables: AppVariables }>();
planningRoutes.use("/api/gardens/*", requireExecutionContext);

function repository(context: { get(name: "execution"): AppVariables["execution"] }) { const execution = context.get("execution"); return new PlanningRepository(execution.data, execution.tenant.organizationId); }
function problem(error: unknown) {
  if (error instanceof PlanningConflictError) return { status: 409 as const, body: { error: "planning_conflict", message: error.message } };
  if (error instanceof PlanningInputError) return { status: 400 as const, body: { error: "planning_input", message: error.message } };
  if (error instanceof z.ZodError) return { status: 400 as const, body: { error: "validation_failed", issues: error.issues } };
  throw error;
}

planningRoutes.get("/api/gardens/:id/selections", async (context) => { const execution = context.get("execution"); execution.access.require({ permission: "garden.read" }); return context.json({ selections: await repository(context).listSelections(context.req.param("id")) }); });
planningRoutes.post("/api/gardens/:id/selections", async (context) => {
  const execution = context.get("execution"); execution.access.require({ permission: "garden.write" });
  try { const input = selectionCommand.parse(await context.req.json()); const { expectedRevision, ...selection } = input; return context.json({ selection: await repository(context).saveSelection(context.req.param("id"), { ...selection, id: crypto.randomUUID() }, expectedRevision) }, 201); }
  catch (error) { const response = problem(error); return context.json(response.body, response.status); }
});
planningRoutes.put("/api/gardens/:id/selections/:selectionId", async (context) => {
  const execution = context.get("execution"); execution.access.require({ permission: "garden.write" });
  try { const input = selectionCommand.parse(await context.req.json()); const { expectedRevision, ...selection } = input; return context.json({ selection: await repository(context).saveSelection(context.req.param("id"), { ...selection, id: context.req.param("selectionId") }, expectedRevision) }); }
  catch (error) { const response = problem(error); return context.json(response.body, response.status); }
});
planningRoutes.delete("/api/gardens/:id/selections/:selectionId", async (context) => {
  const execution = context.get("execution"); execution.access.require({ permission: "garden.write" });
  try { const expectedRevision = z.coerce.number().int().positive().parse(context.req.query("revision")); await repository(context).removeSelection(context.req.param("id"), context.req.param("selectionId"), expectedRevision); return context.body(null, 204); }
  catch (error) { const response = problem(error); return context.json(response.body, response.status); }
});
planningRoutes.post("/api/gardens/:id/plans", async (context) => {
  const execution = context.get("execution"); execution.access.require({ permission: "garden.write" });
  try { const input = generationCommand.parse(await context.req.json()); return context.json({ plan: await repository(context).generate(context.req.param("id"), input.seasonYear) }, 201); }
  catch (error) { const response = problem(error); return context.json(response.body, response.status); }
});
planningRoutes.get("/api/gardens/:id/plans", async (context) => { const execution = context.get("execution"); execution.access.require({ permission: "garden.read" }); return context.json({ plans: await repository(context).listPlans(context.req.param("id")) }); });
planningRoutes.get("/api/gardens/:id/plans/:planId/print.svg", async (context) => { const execution = context.get("execution"); execution.access.require({ permission: "garden.read" }); const svg = await repository(context).printSvg(context.req.param("id"), context.req.param("planId")); return svg ? context.body(svg, 200, { "content-type": "image/svg+xml", "cache-control": "private, no-store" }) : context.json({ error: "not_found" }, 404); });
planningRoutes.post("/api/gardens/:id/plans/:planId/adjust", async (context) => {
  const execution = context.get("execution"); execution.access.require({ permission: "garden.write" });
  try { const input = adjustmentCommand.parse(await context.req.json()); return context.json({ plan: await repository(context).adjustPlacement(context.req.param("id"), context.req.param("planId"), input.placementId, input.bedId, input.position) }, 201); }
  catch (error) { const response = problem(error); return context.json(response.body, response.status); }
});
planningRoutes.post("/api/gardens/:id/plans/:planId/activate", async (context) => {
  const execution = context.get("execution"); execution.access.require({ permission: "garden.write" });
  try { const input = activationCommand.parse(await context.req.json()); return context.json({ plan: await repository(context).activate(context.req.param("id"), context.req.param("planId"), input.acknowledgedLimitations) }); }
  catch (error) { const response = problem(error); return context.json(response.body, response.status); }
});
