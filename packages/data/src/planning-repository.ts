import { cropSelectionSchema, planInputSnapshotSchema, planResultSchema, type CropSelection, type PlanInputSnapshot, type PlanResult } from "@easygardenplan/contracts";
import { bed, bedGeometryRevision, climateAssociation, crop, cropSelection, cropVariety, garden, gardenPlanVersion, type Database } from "@easygardenplan/db";
import { circleFits, generatePlan } from "@easygardenplan/domain";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { KnowledgeRepository } from "./knowledge-repository.js";

export class PlanningConflictError extends Error {}
export class PlanningInputError extends Error {}

type SelectionInput = Omit<CropSelection, "revision">;

export class PlanningRepository {
  constructor(private readonly database: Database, private readonly organizationId: string, private readonly catalogReleaseId?: string) {}

  async listSelections(gardenId: string) {
    return await this.database.select().from(cropSelection).where(and(eq(cropSelection.organizationId, this.organizationId), eq(cropSelection.gardenId, gardenId))).orderBy(desc(cropSelection.priority), asc(cropSelection.createdAt));
  }

  async saveSelection(gardenId: string, raw: SelectionInput, expectedRevision: number) {
    const selection = cropSelectionSchema.omit({ revision: true }).parse(raw);
    return await this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`garden-plan:${gardenId}`}))`);
      const [plot] = await transaction.select({ id: garden.id }).from(garden).where(and(eq(garden.id, gardenId), eq(garden.organizationId, this.organizationId))).limit(1);
      if (!plot) throw new PlanningInputError("Garden not found");
      const [plant] = await transaction.select({ id: crop.id }).from(crop).where(and(eq(crop.id, selection.cropId), eq(crop.status, "published"))).limit(1);
      if (!plant) throw new PlanningInputError("Crop is not in the published catalog");
      if (selection.varietyId) {
        const [variety] = await transaction.select({ id: cropVariety.id }).from(cropVariety).where(and(eq(cropVariety.id, selection.varietyId), eq(cropVariety.cropId, selection.cropId), eq(cropVariety.status, "published"))).limit(1);
        if (!variety) throw new PlanningInputError("Variety does not belong to the selected crop or is not published");
      }
      if (selection.preferredBedId) {
        const [preferred] = await transaction.select({ id: bed.id }).from(bed).where(and(eq(bed.id, selection.preferredBedId), eq(bed.gardenId, gardenId), eq(bed.organizationId, this.organizationId))).limit(1);
        if (!preferred) throw new PlanningInputError("Preferred bed does not belong to this garden");
      }
      if (expectedRevision === 0) {
        const [created] = await transaction.insert(cropSelection).values({ ...selection, organizationId: this.organizationId, gardenId, revision: 1 }).returning();
        if (!created) throw new PlanningConflictError("Selection was not created");
        return created;
      }
      const [updated] = await transaction.update(cropSelection).set({ cropId: selection.cropId, varietyId: selection.varietyId, method: selection.method, quantity: selection.quantity, preferredBedId: selection.preferredBedId, bedRestriction: selection.bedRestriction, priority: selection.priority, revision: expectedRevision + 1, updatedAt: new Date() }).where(and(eq(cropSelection.id, selection.id), eq(cropSelection.organizationId, this.organizationId), eq(cropSelection.gardenId, gardenId), eq(cropSelection.revision, expectedRevision))).returning();
      if (!updated) throw new PlanningConflictError("Selection changed while it was being edited");
      return updated;
    });
  }

  async removeSelection(gardenId: string, selectionId: string, expectedRevision: number): Promise<boolean> {
    return await this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`garden-plan:${gardenId}`}))`);
      const deleted = await transaction.delete(cropSelection).where(and(eq(cropSelection.id, selectionId), eq(cropSelection.organizationId, this.organizationId), eq(cropSelection.gardenId, gardenId), eq(cropSelection.revision, expectedRevision))).returning();
      if (!deleted.length) throw new PlanningConflictError("Selection changed before it could be removed");
      return true;
    });
  }

  private async snapshot(database: Database, gardenId: string, seasonYear: number): Promise<PlanInputSnapshot> {
    const [plot] = await database.select({ id: garden.id, revision: garden.revision, timezone: garden.timezone }).from(garden).where(and(eq(garden.id, gardenId), eq(garden.organizationId, this.organizationId))).limit(1);
    if (!plot) throw new PlanningInputError("Garden not found");
    if (!plot.timezone) throw new PlanningInputError("Confirm the garden location and timezone before planning");
    const selections = await database.select().from(cropSelection).where(and(eq(cropSelection.organizationId, this.organizationId), eq(cropSelection.gardenId, gardenId))).orderBy(desc(cropSelection.priority), asc(cropSelection.id));
    if (!selections.length) throw new PlanningInputError("Choose at least one crop before planning");
    const beds = await database.select({ id: bed.id, revisionId: bedGeometryRevision.id, revision: bed.revision, geometry: bedGeometryRevision.geometry }).from(bed).innerJoin(bedGeometryRevision, eq(bedGeometryRevision.id, bed.activeRevisionId)).where(and(eq(bed.organizationId, this.organizationId), eq(bed.gardenId, gardenId))).orderBy(asc(bed.id));
    if (!beds.length) throw new PlanningInputError("Save at least one bed before planning");
    const [climate] = await database.select().from(climateAssociation).where(and(eq(climateAssociation.organizationId, this.organizationId), eq(climateAssociation.gardenId, gardenId), eq(climateAssociation.active, true))).limit(1);
    const catalog = await new KnowledgeRepository(database).published(this.catalogReleaseId);
    if (!catalog.releaseId) throw new PlanningInputError("No reviewed crop catalog has been published");
    return planInputSnapshotSchema.parse({ gardenId, gardenRevision: plot.revision, timezone: plot.timezone, seasonYear, catalogReleaseId: catalog.releaseId, climate: climate ? { associationId: climate.id, version: climate.version, state: climate.state, hardinessZone: climate.hardinessZone, springFrostLocalDate: climate.springFrostLocalDate, autumnFrostLocalDate: climate.autumnFrostLocalDate, source: climate.source } : null, algorithmVersion: "grid-v1", selections: selections.map((item) => ({ id: item.id, cropId: item.cropId, varietyId: item.varietyId, method: item.method, quantity: item.quantity, preferredBedId: item.preferredBedId, bedRestriction: item.bedRestriction, priority: item.priority, revision: item.revision })), beds, rules: catalog.rules });
  }

  async generate(gardenId: string, seasonYear: number) {
    return await this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`garden-plan:${gardenId}`}))`);
      const snapshot = await this.snapshot(transaction as unknown as Database, gardenId, seasonYear);
      const result = await generatePlan(snapshot);
      const [latest] = await transaction.select({ version: gardenPlanVersion.version }).from(gardenPlanVersion).where(and(eq(gardenPlanVersion.organizationId, this.organizationId), eq(gardenPlanVersion.gardenId, gardenId))).orderBy(desc(gardenPlanVersion.version)).limit(1);
      const [created] = await transaction.insert(gardenPlanVersion).values({ organizationId: this.organizationId, gardenId, version: (latest?.version ?? 0) + 1, state: "proposal", algorithmVersion: result.algorithmVersion, inputFingerprint: result.fingerprint, inputSnapshot: snapshot, result }).returning();
      if (!created) throw new Error("Plan proposal was not persisted");
      return this.parsePlan(created);
    });
  }

  async listPlans(gardenId: string) {
    const rows = await this.database.select().from(gardenPlanVersion).where(and(eq(gardenPlanVersion.organizationId, this.organizationId), eq(gardenPlanVersion.gardenId, gardenId))).orderBy(desc(gardenPlanVersion.version));
    return rows.map((row) => this.parsePlan(row));
  }

  async adjustPlacement(gardenId: string, planId: string, placementId: string, bedId: string, position: { x: number; y: number }) {
    return await this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`garden-plan:${gardenId}`}))`);
      const [proposal] = await transaction.select().from(gardenPlanVersion).where(and(eq(gardenPlanVersion.id, planId), eq(gardenPlanVersion.organizationId, this.organizationId), eq(gardenPlanVersion.gardenId, gardenId), eq(gardenPlanVersion.state, "proposal"))).limit(1);
      if (!proposal) throw new PlanningConflictError("Only a current proposal can be adjusted");
      const snapshot = planInputSnapshotSchema.parse(proposal.inputSnapshot); const result = planResultSchema.parse(proposal.result);
      const moving = result.placements.find((item) => item.id === placementId); const target = snapshot.beds.find((item) => item.id === bedId);
      if (!moving || !target) throw new PlanningInputError("Placement or target bed was not found in this proposal");
      if (!circleFits(position, moving.footprintRadiusMeters, target.geometry)) throw new PlanningInputError("The plant footprint must stay inside usable bed space");
      const collision = result.placements.some((item) => item.id !== moving.id && item.bedId === bedId && Math.hypot(item.position.x - position.x, item.position.y - position.y) + 1e-8 < item.footprintRadiusMeters + moving.footprintRadiusMeters);
      if (collision) throw new PlanningInputError("The plant footprint overlaps another planned plant");
      const adjusted = planResultSchema.parse({ ...result, placements: result.placements.map((item) => item.id === moving.id ? { ...item, bedId, position, pinned: true } : item) });
      const [latest] = await transaction.select({ version: gardenPlanVersion.version }).from(gardenPlanVersion).where(and(eq(gardenPlanVersion.organizationId, this.organizationId), eq(gardenPlanVersion.gardenId, gardenId))).orderBy(desc(gardenPlanVersion.version)).limit(1);
      await transaction.update(gardenPlanVersion).set({ state: "superseded" }).where(eq(gardenPlanVersion.id, proposal.id));
      const [created] = await transaction.insert(gardenPlanVersion).values({ organizationId: this.organizationId, gardenId, version: (latest?.version ?? 0) + 1, state: "proposal", algorithmVersion: proposal.algorithmVersion, inputFingerprint: proposal.inputFingerprint, inputSnapshot: snapshot, result: adjusted }).returning();
      if (!created) throw new Error("Adjusted proposal was not persisted");
      return this.parsePlan(created);
    });
  }

  async activate(gardenId: string, planId: string, acknowledgedLimitations: string[]) {
    const outcome = await this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`garden-plan:${gardenId}`}))`);
      const [proposal] = await transaction.select().from(gardenPlanVersion).where(and(eq(gardenPlanVersion.id, planId), eq(gardenPlanVersion.organizationId, this.organizationId), eq(gardenPlanVersion.gardenId, gardenId), eq(gardenPlanVersion.state, "proposal"))).limit(1);
      if (!proposal) throw new PlanningConflictError("Plan is not an activatable proposal");
      const savedSnapshot = planInputSnapshotSchema.parse(proposal.inputSnapshot);
      const current = await this.snapshot(transaction as unknown as Database, gardenId, savedSnapshot.seasonYear);
      const currentResult = await generatePlan(current);
      if (currentResult.fingerprint !== proposal.inputFingerprint) {
        await transaction.update(gardenPlanVersion).set({ state: "stale" }).where(eq(gardenPlanVersion.id, proposal.id));
        return { stale: true as const };
      }
      const result = planResultSchema.parse(proposal.result);
      const required = new Set(result.unresolved.map((item) => `${item.kind}:${item.selectionId}:${item.code}`));
      if ([...required].some((item) => !acknowledgedLimitations.includes(item))) throw new PlanningInputError("Every unresolved limitation must be acknowledged before activation");
      await transaction.update(gardenPlanVersion).set({ state: "superseded" }).where(and(eq(gardenPlanVersion.organizationId, this.organizationId), eq(gardenPlanVersion.gardenId, gardenId), eq(gardenPlanVersion.state, "active")));
      const [active] = await transaction.update(gardenPlanVersion).set({ state: "active", acknowledgedLimitations: [...required].sort(), activatedAt: new Date() }).where(and(eq(gardenPlanVersion.id, proposal.id), eq(gardenPlanVersion.state, "proposal"))).returning();
      if (!active) throw new PlanningConflictError("Another activation won the race");
      return { stale: false as const, plan: this.parsePlan(active) };
    });
    if (outcome.stale) throw new PlanningConflictError("Garden, crop, climate, or catalog inputs changed; generate a new proposal");
    return outcome.plan;
  }

  private parsePlan(row: typeof gardenPlanVersion.$inferSelect) {
    return { ...row, inputSnapshot: planInputSnapshotSchema.parse(row.inputSnapshot), result: planResultSchema.parse(row.result), acknowledgedLimitations: Array.isArray(row.acknowledgedLimitations) ? row.acknowledgedLimitations.filter((item): item is string => typeof item === "string") : [] };
  }
}
