import type { AuthEnvironment } from "@easygardenplan/auth";
import { progressEventInputSchema, taskTransitionSchema } from "@easygardenplan/contracts";
import { PlanningConflictError, PlanningInputError, ProgressRepository } from "@easygardenplan/data";
import { Hono } from "hono";
import { z } from "zod";
import { requireExecutionContext, type AppVariables } from "./execution-context.js";

export const progressRoutes = new Hono<{ Bindings: AuthEnvironment; Variables: AppVariables }>();
progressRoutes.use("/api/gardens/*", requireExecutionContext);
function repository(context: { get(name: "execution"): AppVariables["execution"] }) { const execution = context.get("execution"); return new ProgressRepository(execution.data, execution.tenant.organizationId); }
function problem(error: unknown) { if (error instanceof PlanningConflictError) return { status: 409 as const, body: { error: "progress_conflict", message: error.message } }; if (error instanceof PlanningInputError) return { status: 400 as const, body: { error: "progress_input", message: error.message } }; if (error instanceof z.ZodError) return { status: 400 as const, body: { error: "validation_failed", issues: error.issues } }; throw error; }

progressRoutes.get("/api/gardens/:id/tasks", async (context) => { const execution = context.get("execution"); execution.access.require({ permission: "garden.read" }); return context.json({ tasks: await repository(context).listTasks(context.req.param("id")) }); });
progressRoutes.post("/api/gardens/:id/tasks/:taskId/transition", async (context) => { const execution = context.get("execution"); execution.access.require({ permission: "garden.write" }); try { return context.json({ status: await repository(context).transition(context.req.param("id"), context.req.param("taskId"), taskTransitionSchema.parse(await context.req.json())) }, 201); } catch (error) { const response = problem(error); return context.json(response.body, response.status); } });
progressRoutes.get("/api/gardens/:id/progress", async (context) => { const execution = context.get("execution"); execution.access.require({ permission: "garden.read" }); return context.json({ events: await repository(context).listEvents(context.req.param("id")) }); });
progressRoutes.post("/api/gardens/:id/progress", async (context) => { const execution = context.get("execution"); execution.access.require({ permission: "garden.write" }); try { return context.json({ event: await repository(context).record(context.req.param("id"), progressEventInputSchema.parse(await context.req.json())) }, 201); } catch (error) { const response = problem(error); return context.json(response.body, response.status); } });
