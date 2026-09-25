import { geocodeRequestSchema, monthDaySchema } from "@easygardenplan/contracts";
import { ClimateRepository, LocationConflictError, LocationRateLimitError, LocationRepository } from "@easygardenplan/data";
import { FixtureGeocoder, GeoapifyError, GeoapifyGeocoder, type Geocoder } from "@easygardenplan/integrations";
import type { AuthEnvironment } from "@easygardenplan/auth";
import { garden } from "@easygardenplan/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireExecutionContext, type AppVariables } from "./execution-context.js";

const confirmSchema = z.object({ expectedRevision: z.number().int().positive(), location: z.unknown() }).strict();
const associationSchema = z.object({ elevationMeters: z.number().finite().nullable().optional() }).strict();
const userAnchorSchema = z.object({ hardinessZone: z.string().min(1).nullable().optional(), frostState: z.enum(["known", "frost_free", "unknown"]), springFrostLocalDate: monthDaySchema.nullable().optional(), autumnFrostLocalDate: monthDaySchema.nullable().optional(), rationale: z.string().trim().min(3).max(500) }).strict();

export const locationRoutes = new Hono<{ Bindings: AuthEnvironment; Variables: AppVariables }>();
locationRoutes.use("/api/location/*", requireExecutionContext);

function geocoder(environment: AuthEnvironment): Geocoder | null {
  if (environment.GEOAPIFY_API_KEY) return new GeoapifyGeocoder({ apiKey: environment.GEOAPIFY_API_KEY });
  return environment.APP_ENV === "local" ? new FixtureGeocoder([]) : null;
}

locationRoutes.post("/api/location/geocode", async (context) => {
  const execution = context.get("execution");
  execution.access.require({ permission: "garden.write" });
  const parsed = geocodeRequestSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  try {
    const provider = geocoder(context.env);
    if (!provider) return context.json({ error: "geocoder_unavailable", manualPinAvailable: true }, 503);
    if (context.env.GEOAPIFY_API_KEY) await new LocationRepository(execution.data, execution.tenant.organizationId).consumeGeocodeRequest(execution.clock.now());
    const candidates = await provider.forward(parsed.data);
    return context.json({ candidates, manualPinAvailable: true });
  } catch (error) {
    if (error instanceof LocationRateLimitError) return context.json({ error: "rate_limited", message: error.message, manualPinAvailable: true }, 429);
    if (error instanceof GeoapifyError) return context.json({ error: error.code, message: error.message, retryable: error.retryable, manualPinAvailable: true }, error.code === "rate_limited" ? 429 : 502);
    throw error;
  }
});

locationRoutes.put("/api/gardens/:id/location", async (context) => {
  const execution = context.get("execution");
  execution.access.require({ permission: "garden.write" });
  const parsed = confirmSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  try {
    const garden = await new LocationRepository(execution.data, execution.tenant.organizationId).confirm(context.req.param("id"), parsed.data.expectedRevision, parsed.data.location);
    return garden ? context.json({ garden }) : context.json({ error: "not_found" }, 404);
  } catch (error) {
    if (error instanceof LocationConflictError) return context.json({ error: "revision_conflict", message: error.message }, 409);
    if (error instanceof z.ZodError) return context.json({ error: "validation_failed", issues: error.issues }, 400);
    throw error;
  }
});

locationRoutes.get("/api/gardens/:id/climate", async (context) => {
  const execution = context.get("execution");
  execution.access.require({ permission: "garden.read" });
  return context.json({ climate: await new ClimateRepository(execution.data).current(context.req.param("id")) });
});

locationRoutes.post("/api/gardens/:id/climate/associate", async (context) => {
  const execution = context.get("execution");
  execution.access.require({ permission: "garden.write" });
  const parsed = associationSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  const [plot] = await execution.data.select().from(garden).where(and(eq(garden.id, context.req.param("id")), eq(garden.organizationId, execution.tenant.organizationId))).limit(1);
  if (!plot?.locationConfirmed || plot.latitude === null || plot.longitude === null) return context.json({ error: "location_required" }, 409);
  const climate = await new ClimateRepository(execution.data).associateGarden({ gardenId: plot.id, coordinate: { latitude: Number(plot.latitude), longitude: Number(plot.longitude) }, ...(parsed.data.elevationMeters !== undefined ? { elevationMeters: parsed.data.elevationMeters } : {}) });
  return context.json({ climate });
});

locationRoutes.put("/api/gardens/:id/climate/anchor", async (context) => {
  const execution = context.get("execution");
  execution.access.require({ permission: "garden.write" });
  const parsed = userAnchorSchema.safeParse(await context.req.json());
  if (!parsed.success) return context.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  const anchor = { gardenId: context.req.param("id"), frostState: parsed.data.frostState, rationale: parsed.data.rationale, ...(parsed.data.hardinessZone !== undefined ? { hardinessZone: parsed.data.hardinessZone } : {}), ...(parsed.data.springFrostLocalDate !== undefined ? { springFrostLocalDate: parsed.data.springFrostLocalDate } : {}), ...(parsed.data.autumnFrostLocalDate !== undefined ? { autumnFrostLocalDate: parsed.data.autumnFrostLocalDate } : {}) };
  try { return context.json({ climate: await new ClimateRepository(execution.data).setUserAnchor(anchor) }); }
  catch (error) { return context.json({ error: "validation_failed", message: error instanceof Error ? error.message : "Invalid seasonal anchor" }, 400); }
});
