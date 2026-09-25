import type { Garden, CreateGarden, UpdateGarden } from "@easygardenplan/contracts";
import { garden, weatherLocationDue, type Database } from "@easygardenplan/db";
import type { GardenRepository } from "@easygardenplan/domain";
import { and, asc, eq, gt, or, sql, type SQL } from "drizzle-orm";

type ResourceEvents = { statement(name: string, payload: unknown, options: { schemaVersion?: number; idempotencyKey: string }): SQL };

export class PostgresGardenRepository implements GardenRepository {
  constructor(private readonly database: Database, private readonly organizationId: string, private readonly events: ResourceEvents) {}
  async list(input: { cursor?: string; limit: number }): Promise<{ items: Garden[]; nextCursor?: string }> {
    const rows = await this.database.select().from(garden).where(and(eq(garden.organizationId, this.organizationId), input.cursor ? gt(garden.id, input.cursor) : undefined)).orderBy(asc(garden.id)).limit(input.limit + 1);
    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, input.limit) : rows;
    return { items, ...(hasMore && items.at(-1) ? { nextCursor: items.at(-1)!.id } : {}) };
  }
  async get(id: string): Promise<Garden | null> {
    const [record] = await this.database.select().from(garden).where(and(eq(garden.id, id), eq(garden.organizationId, this.organizationId))).limit(1);
    return record ?? null;
  }
  async create(input: CreateGarden): Promise<Garden> {
    return this.database.transaction(async (transaction) => {
      const [record] = await transaction.insert(garden).values({ ...input, organizationId: this.organizationId }).returning();
      if (!record) throw new Error("Failed to create Garden");
      await transaction.execute(this.events.statement("resource.garden.created", { resourceId: record.id }, {
        schemaVersion: 1, idempotencyKey: "resource.garden.created:" + record.id,
      }));
      if (record.monitoringEnabled && record.locationConfirmed && record.latitude && record.longitude && record.timezone) await transaction.insert(weatherLocationDue).values({ gardenId: record.id, organizationId: this.organizationId, locationRevision: record.revision, nextDueAt: new Date(), updatedAt: new Date() });
      return record;
    });
  }
  async update(id: string, input: UpdateGarden): Promise<Garden | null> {
    return this.database.transaction(async (transaction) => {
      const changed = or(
        input.name !== undefined ? sql`${garden.name} is distinct from ${input.name}` : undefined,
        input.latitude !== undefined ? sql`${garden.latitude} is distinct from ${input.latitude}` : undefined,
        input.longitude !== undefined ? sql`${garden.longitude} is distinct from ${input.longitude}` : undefined,
        input.timezone !== undefined ? sql`${garden.timezone} is distinct from ${input.timezone}` : undefined,
        input.locationSource !== undefined ? sql`${garden.locationSource} is distinct from ${input.locationSource}` : undefined,
        input.locationProviderPlaceId !== undefined ? sql`${garden.locationProviderPlaceId} is distinct from ${input.locationProviderPlaceId}` : undefined,
        input.formattedAddress !== undefined ? sql`${garden.formattedAddress} is distinct from ${input.formattedAddress}` : undefined,
        input.units !== undefined ? sql`${garden.units} is distinct from ${input.units}` : undefined,
        input.conditions !== undefined ? sql`${garden.conditions} is distinct from ${input.conditions}` : undefined,
        input.monitoringEnabled !== undefined ? sql`${garden.monitoringEnabled} is distinct from ${input.monitoringEnabled}` : undefined,
        input.locationConfirmed !== undefined ? sql`${garden.locationConfirmed} is distinct from ${input.locationConfirmed}` : undefined,
      );
      if (!changed) {
        const [record] = await transaction.select().from(garden).where(and(eq(garden.id, id), eq(garden.organizationId, this.organizationId))).limit(1);
        return record ?? null;
      }
      const [record] = await transaction.update(garden)
        .set({ ...input, revision: sql`${garden.revision} + 1`, updatedAt: new Date() })
        .where(and(eq(garden.id, id), eq(garden.organizationId, this.organizationId), changed)).returning();
      if (!record) {
        const [current] = await transaction.select().from(garden).where(and(eq(garden.id, id), eq(garden.organizationId, this.organizationId))).limit(1);
        return current ?? null;
      }
      await transaction.execute(this.events.statement("resource.garden.updated", { resourceId: record.id, revision: record.revision }, {
        schemaVersion: 1, idempotencyKey: "resource.garden.updated:" + record.id + ":" + record.revision,
      }));
      if (record.monitoringEnabled && record.locationConfirmed && record.latitude && record.longitude && record.timezone) {
        await transaction.insert(weatherLocationDue).values({ gardenId: record.id, organizationId: this.organizationId, locationRevision: record.revision, nextDueAt: new Date(), updatedAt: new Date() }).onConflictDoUpdate({ target: weatherLocationDue.gardenId, set: { locationRevision: record.revision, nextDueAt: new Date(), leaseToken: null, leaseExpiresAt: null, failureCount: 0, updatedAt: new Date() } });
      } else await transaction.delete(weatherLocationDue).where(and(eq(weatherLocationDue.organizationId, this.organizationId), eq(weatherLocationDue.gardenId, record.id)));
      return record;
    });
  }
  async remove(id: string): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const [record] = await transaction.delete(garden).where(and(eq(garden.id, id), eq(garden.organizationId, this.organizationId))).returning();
      if (!record) return false;
      await transaction.execute(this.events.statement("resource.garden.deleted", { resourceId: record.id, revision: record.revision }, {
        schemaVersion: 1, idempotencyKey: "resource.garden.deleted:" + record.id,
      }));
      return true;
    });
  }
}
