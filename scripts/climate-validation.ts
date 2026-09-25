import { ClimateRepository } from "../packages/data/src/climate-repository.js";
import { createDatabase, garden, organization } from "../packages/db/src/index.js";
import { eq } from "drizzle-orm";

const connectionString = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL is required");
const locations = [
  { name: "Minneapolis, Minnesota", latitude: 44.9778, longitude: -93.265 },
  { name: "Seattle, Washington", latitude: 47.6062, longitude: -122.3321 },
  { name: "Dallas, Texas", latitude: 32.7767, longitude: -96.797 },
  { name: "Phoenix, Arizona", latitude: 33.4484, longitude: -112.074 },
  { name: "Aspen, Colorado", latitude: 39.1911, longitude: -106.8175 },
  { name: "Miami, Florida", latitude: 25.7617, longitude: -80.1918 },
  { name: "Anchorage, Alaska", latitude: 61.2181, longitude: -149.9003 },
  { name: "Honolulu, Hawaii", latitude: 21.3099, longitude: -157.8581 },
  { name: "San Juan, Puerto Rico", latitude: 18.4655, longitude: -66.1057 },
];
const database = createDatabase(connectionString, "postgres-js"); const organizationIds: string[] = [];
try {
  const results = [];
  for (const location of locations) {
    const organizationId = `climate-validation-${crypto.randomUUID()}`; organizationIds.push(organizationId);
    await database.insert(organization).values({ id: organizationId, name: location.name, slug: organizationId, createdAt: new Date() });
    const [plot] = await database.insert(garden).values({ organizationId, name: "Validation garden", latitude: String(location.latitude), longitude: String(location.longitude), timezone: "Etc/UTC", locationConfirmed: true }).returning();
    const started = performance.now();
    const association = await new ClimateRepository(database).associateGarden({ gardenId: plot!.id, coordinate: location });
    const elapsedMilliseconds = Math.round((performance.now() - started) * 10) / 10;
    const value = association as { state: string; hardinessZone: string | null; springFrostLocalDate: string | null; autumnFrostLocalDate: string | null; sourceEvidence: Array<{ kind: string; distanceMeters: number; sourceRelease: string }> };
    if (!value.sourceEvidence.some(({ kind }) => kind === "hardiness")) throw new Error(`${location.name} has no hardiness match`);
    if (!value.sourceEvidence.some(({ kind }) => kind === "frost_normals")) throw new Error(`${location.name} has no frost-normal match`);
    results.push({ ...location, state: value.state, hardinessZone: value.hardinessZone, springFrostLocalDate: value.springFrostLocalDate, autumnFrostLocalDate: value.autumnFrostLocalDate, elapsedMilliseconds, sources: value.sourceEvidence.map(({ kind, distanceMeters, sourceRelease }) => ({ kind, distanceKilometers: Math.round(distanceMeters / 100) / 10, sourceRelease })) });
  }
  process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), locations: results }, null, 2)}\n`);
} finally {
  for (const organizationId of organizationIds) await database.delete(organization).where(eq(organization.id, organizationId));
  await database.$client.end();
}
