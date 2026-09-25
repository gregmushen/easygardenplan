import { confirmedLocationSchema } from "@easygardenplan/contracts";
import { garden, locationProviderUsage, type Database } from "@easygardenplan/db";
import { and, eq, lt, sql } from "drizzle-orm";

export class LocationConflictError extends Error {}
export class LocationRateLimitError extends Error {}

export class LocationRepository {
  constructor(private readonly database: Database, private readonly organizationId: string) {}

  async consumeGeocodeRequest(now = new Date(), limit = 30): Promise<void> {
    const windowStartedAt = new Date(now);
    windowStartedAt.setUTCSeconds(0, 0);
    const rows = await this.database.insert(locationProviderUsage)
      .values({ organizationId: this.organizationId, provider: "geoapify", windowStartedAt, requestCount: 1 })
      .onConflictDoUpdate({
        target: [locationProviderUsage.organizationId, locationProviderUsage.provider, locationProviderUsage.windowStartedAt],
        set: { requestCount: sql`${locationProviderUsage.requestCount} + 1` },
        setWhere: lt(locationProviderUsage.requestCount, limit),
      }).returning();
    if (rows.length === 0) throw new LocationRateLimitError("Too many geocoding requests; place the pin manually or retry shortly");
  }

  async confirm(gardenId: string, expectedRevision: number, input: unknown) {
    const location = confirmedLocationSchema.parse(input);
    const [updated] = await this.database.update(garden).set({
      latitude: String(location.coordinate.latitude),
      longitude: String(location.coordinate.longitude),
      timezone: location.timezone,
      locationSource: location.source,
      locationProviderPlaceId: location.providerPlaceId ?? null,
      formattedAddress: location.formattedAddress ?? null,
      regionIds: location.regionIds,
      locationConfirmed: true,
      revision: sql`${garden.revision} + 1`,
      updatedAt: new Date(),
    }).where(and(eq(garden.id, gardenId), eq(garden.organizationId, this.organizationId), eq(garden.revision, expectedRevision))).returning();
    if (updated) return updated;
    const [current] = await this.database.select({ revision: garden.revision }).from(garden).where(and(eq(garden.id, gardenId), eq(garden.organizationId, this.organizationId))).limit(1);
    if (!current) return null;
    throw new LocationConflictError(`Garden changed from revision ${expectedRevision} to ${current.revision}`);
  }
}
