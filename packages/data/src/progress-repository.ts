import { bedGeometrySchema, metricPointSchema, planInputSnapshotSchema, progressEventInputSchema, taskTransitionSchema, type ProgressEventInput, type TaskTransition } from "@easygardenplan/contracts";
import { bed, bedGeometryRevision, gardenPlanVersion, gardenProgressEvent, planTask, taskStatusVersion, type Database } from "@easygardenplan/db";
import { circleFits } from "@easygardenplan/domain";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { PlanningConflictError, PlanningInputError } from "./planning-repository.js";

function addDays(value: string, days: number): string { const [year, month, day] = value.split("-").map(Number) as [number, number, number]; const date = new Date(Date.UTC(year, month - 1, day)); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }

export class ProgressRepository {
  constructor(private readonly database: Database, private readonly organizationId: string) {}

  async listTasks(gardenId: string) {
    const tasks = await this.database.select({ task: planTask, planState: gardenPlanVersion.state, planVersion: gardenPlanVersion.version }).from(planTask).innerJoin(gardenPlanVersion, eq(gardenPlanVersion.id, planTask.planVersionId)).where(and(eq(planTask.organizationId, this.organizationId), eq(planTask.gardenId, gardenId))).orderBy(asc(planTask.windowStartLocalDate), asc(planTask.createdAt));
    const ids = tasks.map(({ task }) => task.id); const statuses = ids.length ? await this.database.select().from(taskStatusVersion).where(and(eq(taskStatusVersion.organizationId, this.organizationId), inArray(taskStatusVersion.taskId, ids))).orderBy(desc(taskStatusVersion.revision)) : [];
    const latest = new Map<string, typeof taskStatusVersion.$inferSelect>(); for (const status of statuses) if (!latest.has(status.taskId)) latest.set(status.taskId, status);
    return tasks.map(({ task, planState, planVersion }) => ({ ...task, planState, planVersion, status: latest.get(task.id) }));
  }

  async listEvents(gardenId: string) {
    const events = await this.database.select().from(gardenProgressEvent).where(and(eq(gardenProgressEvent.organizationId, this.organizationId), eq(gardenProgressEvent.gardenId, gardenId))).orderBy(asc(gardenProgressEvent.occurredLocalDate), asc(gardenProgressEvent.createdAt));
    const bedIds = [...new Set(events.flatMap(({ bedId }) => bedId ? [bedId] : []))];
    const activeBeds = bedIds.length ? await this.database.select({ id: bed.id, revision: bed.revision, geometry: bedGeometryRevision.geometry }).from(bed).innerJoin(bedGeometryRevision, and(eq(bedGeometryRevision.organizationId, bed.organizationId), eq(bedGeometryRevision.id, bed.activeRevisionId))).where(and(eq(bed.organizationId, this.organizationId), inArray(bed.id, bedIds))) : [];
    const current = new Map(activeBeds.map((item) => [item.id, item]));
    return events.map((event) => {
      if (!event.bedId || !event.position) return { ...event, geometryStatus: "not_recorded" as const, currentBedRevision: null };
      const plot = current.get(event.bedId); if (!plot) return { ...event, geometryStatus: "bed_unavailable" as const, currentBedRevision: null };
      const position = metricPointSchema.safeParse(event.position); const geometry = bedGeometrySchema.safeParse(plot.geometry);
      if (!position.success || !geometry.success) return { ...event, geometryStatus: "bed_unavailable" as const, currentBedRevision: plot.revision };
      return { ...event, geometryStatus: circleFits(position.data, 0, geometry.data) ? "inside_current_bed" as const : "outside_current_bed" as const, currentBedRevision: plot.revision };
    });
  }

  async transition(gardenId: string, taskId: string, raw: TaskTransition) {
    const command = taskTransitionSchema.parse(raw);
    return await this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`garden-task:${taskId}`}))`);
      const [task] = await transaction.select().from(planTask).where(and(eq(planTask.id, taskId), eq(planTask.organizationId, this.organizationId), eq(planTask.gardenId, gardenId))).limit(1);
      if (!task) throw new PlanningInputError("Task not found");
      const [current] = await transaction.select().from(taskStatusVersion).where(and(eq(taskStatusVersion.organizationId, this.organizationId), eq(taskStatusVersion.taskId, taskId))).orderBy(desc(taskStatusVersion.revision)).limit(1);
      if (!current || current.revision !== command.expectedRevision) throw new PlanningConflictError("Task changed before this update was saved");
      if (current.state === "completed" || current.state === "skipped") throw new PlanningConflictError("Completed and skipped tasks are historical and cannot be changed");
      const start = command.state === "postponed" ? command.scheduledStartLocalDate! : current.scheduledStartLocalDate; const end = command.state === "postponed" ? command.scheduledEndLocalDate! : current.scheduledEndLocalDate;
      const [status] = await transaction.insert(taskStatusVersion).values({ organizationId: this.organizationId, taskId, revision: current.revision + 1, state: command.state, scheduledStartLocalDate: start, scheduledEndLocalDate: end, actualLocalDate: command.actualLocalDate, note: command.note }).returning();
      const eventType = command.state === "completed" ? "task_completed" : command.state === "postponed" ? "task_postponed" : "task_skipped";
      await transaction.insert(gardenProgressEvent).values({ organizationId: this.organizationId, gardenId, planVersionId: task.planVersionId, taskId, selectionId: task.selectionId, eventType, occurredLocalDate: command.actualLocalDate ?? start, note: command.note });
      return status!;
    });
  }

  async record(gardenId: string, raw: ProgressEventInput) {
    const command = progressEventInputSchema.parse(raw);
    return await this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`garden-progress:${gardenId}`}))`);
      const [active] = await transaction.select().from(gardenPlanVersion).where(and(eq(gardenPlanVersion.organizationId, this.organizationId), eq(gardenPlanVersion.gardenId, gardenId), eq(gardenPlanVersion.state, "active"))).limit(1);
      if (!active) throw new PlanningInputError("Activate a plan before recording garden progress");
      const snapshot = planInputSnapshotSchema.parse(active.inputSnapshot); const selection = snapshot.selections.find(({ id }) => id === command.selectionId);
      if (!selection) throw new PlanningInputError("Selection does not belong to the active plan");
      if (command.taskId) { const [task] = await transaction.select({ id: planTask.id }).from(planTask).where(and(eq(planTask.id, command.taskId), eq(planTask.organizationId, this.organizationId), eq(planTask.gardenId, gardenId), eq(planTask.planVersionId, active.id))).limit(1); if (!task) throw new PlanningInputError("Task does not belong to the active plan"); }
      if (command.bedId) { const [plot] = await transaction.select({ id: bed.id }).from(bed).where(and(eq(bed.id, command.bedId), eq(bed.organizationId, this.organizationId), eq(bed.gardenId, gardenId))).limit(1); if (!plot) throw new PlanningInputError("Bed does not belong to this garden"); }
      if (command.supersedesEventId) { const [previous] = await transaction.select({ id: gardenProgressEvent.id }).from(gardenProgressEvent).where(and(eq(gardenProgressEvent.id, command.supersedesEventId), eq(gardenProgressEvent.organizationId, this.organizationId), eq(gardenProgressEvent.gardenId, gardenId))).limit(1); if (!previous) throw new PlanningInputError("Corrected event was not found in this garden"); }
      const [event] = await transaction.insert(gardenProgressEvent).values({ organizationId: this.organizationId, gardenId, planVersionId: active.id, taskId: command.taskId, selectionId: command.selectionId, eventType: command.eventType, occurredLocalDate: command.occurredLocalDate, bedId: command.bedId, position: command.position, supersedesEventId: command.supersedesEventId, note: command.note }).returning();
      if (!event) throw new Error("Progress event was not recorded");
      const anchor = command.eventType === "sown" ? "sowing" : command.eventType === "emerged" ? "emergence" : command.eventType === "transplanted" ? "transplant" : null;
      if (anchor) {
        const rules = snapshot.rules.filter((rule) => rule.cropId === selection.cropId && rule.ruleType === "maturity" && rule.applicability.methods.includes(selection.method) && rule.payload.state === "known" && rule.payload.type === "maturity" && rule.payload.anchor === anchor);
        if (rules.length === 1) { const payload = rules[0]!.payload; if (payload.state === "known" && payload.type === "maturity") { const taskId = crypto.randomUUID(); const start = addDays(command.occurredLocalDate, payload.days.minimum), end = addDays(command.occurredLocalDate, payload.days.maximum); await transaction.insert(planTask).values({ id: taskId, organizationId: this.organizationId, gardenId, planVersionId: active.id, selectionId: selection.id, taskType: "harvest", windowStartLocalDate: start, windowEndLocalDate: end, dependsOnTaskIds: command.taskId ? [command.taskId] : [], instruction: `Expected harvest window based on the recorded ${anchor} date.`, origin: "derived_actual", sourceProgressEventId: event.id }); await transaction.insert(taskStatusVersion).values({ organizationId: this.organizationId, taskId, revision: 1, state: "planned", scheduledStartLocalDate: start, scheduledEndLocalDate: end }); } }
      }
      return event;
    });
  }
}
