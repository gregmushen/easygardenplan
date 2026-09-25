import { editorialDraftSchema, editorialPublicationSchema, growingMethodSchema, publishedRuleSchema, ruleTypeSchema } from "@easygardenplan/contracts";
import { KnowledgeRepository, coverageMatrix } from "@easygardenplan/data";
import { PostgresResearchRuns } from "@easygardenplan/data";
import { ExaResearchAdapter, researchFingerprint } from "@easygardenplan/integrations";
import { researchBriefSchema } from "@easygardenplan/contracts";
import { Hono } from "hono";
import { z } from "zod";

import { requireExecutionContext, type AppVariables } from "./execution-context.js";
import type { AuthEnvironment } from "@easygardenplan/auth";

export const knowledgeRoutes = new Hono<{ Bindings: AuthEnvironment; Variables: AppVariables }>();
knowledgeRoutes.use("/api/catalog", requireExecutionContext);
knowledgeRoutes.use("/api/catalog/*", requireExecutionContext);
knowledgeRoutes.use("/api/editorial/*", requireExecutionContext);

knowledgeRoutes.get("/api/catalog", async (context) => {
  const execution = context.get("execution");
  execution.access.require({ permission: "garden.read" });
  return context.json(await new KnowledgeRepository(execution.data).published(context.req.query("release")));
});

knowledgeRoutes.get("/api/editorial/rules", async (context) => {
  const execution = context.get("execution");
  execution.access.require({ permission: "catalog.publish" });
  return context.json({ rules: await new KnowledgeRepository(execution.data).listEditorialRules() });
});

knowledgeRoutes.post("/api/editorial/research", async (context) => {
  const execution = context.get("execution");
  execution.access.require({ permission: "catalog.publish" });
  if (!context.env.EXA_API_KEY) return context.json({ error: "research_provider_unavailable" }, 503);
  const parsed = researchBriefSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  const adapter = new ExaResearchAdapter(context.env.EXA_API_KEY);
  const fingerprint = await researchFingerprint(parsed.data);
  const run = await new PostgresResearchRuns(execution.data).run(parsed.data, fingerprint, async () => await adapter.search(parsed.data));
  return context.json(run);
});

knowledgeRoutes.post("/api/editorial/drafts", async (context) => {
  const execution = context.get("execution");
  execution.access.require({ permission: "catalog.publish" });
  const parsed = editorialDraftSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  return context.json(await new KnowledgeRepository(execution.data).createDraft(parsed.data), 201);
});

knowledgeRoutes.post("/api/editorial/rules/:id/review", async (context) => {
  const execution = context.get("execution");
  execution.access.require({ permission: "catalog.publish" });
  const parsed = z.object({ decision: z.enum(["accepted", "rejected", "conflicted"]), rationale: z.string().min(1).max(2000) }).strict().safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  const decisionId = await new KnowledgeRepository(execution.data).review({ ruleVersionId: context.req.param("id"), reviewerId: execution.principal.id, ...parsed.data });
  return context.json({ decisionId });
});

knowledgeRoutes.post("/api/editorial/releases", async (context) => {
  const execution = context.get("execution");
  execution.access.require({ permission: "catalog.publish" });
  const body = await context.req.json();
  const parsed = editorialPublicationSchema.omit({ reviewerId: true }).safeParse(body);
  if (!parsed.success) return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  return context.json(await new KnowledgeRepository(execution.data).publish({ ...parsed.data, reviewerId: execution.principal.id }), 201);
});

knowledgeRoutes.post("/api/editorial/rules/:id/withdraw", async (context) => {
  const execution = context.get("execution");
  execution.access.require({ permission: "catalog.publish" });
  const parsed = z.object({ replacementId: z.string().uuid().optional() }).strict().safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  await new KnowledgeRepository(execution.data).withdraw(context.req.param("id"), parsed.data.replacementId);
  return context.body(null, 204);
});

knowledgeRoutes.post("/api/editorial/coverage", async (context) => {
  const execution = context.get("execution");
  execution.access.require({ permission: "catalog.publish" });
  const parsed = z.object({ cropIds: z.array(z.string().uuid()), methods: z.array(growingMethodSchema), ruleTypes: z.array(ruleTypeSchema), regionClasses: z.array(z.string().min(1)), rules: z.array(publishedRuleSchema) }).strict().safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  return context.json({ cells: coverageMatrix(parsed.data) });
});
