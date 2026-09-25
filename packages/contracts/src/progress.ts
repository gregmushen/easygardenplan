import { z } from "zod";
import { metricPointSchema } from "./geometry.js";

export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected YYYY-MM-DD");
export const taskTypeSchema = z.enum(["sow", "seed_start", "transplant", "harvest", "care"]);
export const taskStateSchema = z.enum(["planned", "completed", "postponed", "skipped"]);
export const progressEventTypeSchema = z.enum(["sown", "emerged", "transplanted", "harvested", "removed", "task_completed", "task_postponed", "task_skipped", "correction"]);
export const taskTransitionSchema = z.object({ expectedRevision: z.number().int().positive(), state: z.enum(["completed", "postponed", "skipped"]), actualLocalDate: localDateSchema.nullable().optional(), scheduledStartLocalDate: localDateSchema.optional(), scheduledEndLocalDate: localDateSchema.optional(), note: z.string().trim().max(1000).optional() }).strict().superRefine((value, context) => {
  if (value.state === "postponed" && (!value.scheduledStartLocalDate || !value.scheduledEndLocalDate)) context.addIssue({ code: "custom", message: "Postponed tasks require a new date window" });
  if (value.scheduledStartLocalDate && value.scheduledEndLocalDate && value.scheduledStartLocalDate > value.scheduledEndLocalDate) context.addIssue({ code: "custom", message: "Task window start must not follow its end" });
});
export const progressEventInputSchema = z.object({ taskId: z.string().uuid().nullable().optional(), selectionId: z.string().uuid(), eventType: progressEventTypeSchema, occurredLocalDate: localDateSchema, bedId: z.string().uuid().nullable().optional(), position: metricPointSchema.nullable().optional(), supersedesEventId: z.string().uuid().nullable().optional(), note: z.string().trim().max(1000).optional() }).strict().superRefine((value, context) => {
  if (value.eventType === "correction" && !value.supersedesEventId) context.addIssue({ code: "custom", message: "Corrections must identify the event they supersede" });
  if (value.eventType !== "correction" && value.supersedesEventId) context.addIssue({ code: "custom", message: "Only corrections can supersede an event" });
});
export type TaskTransition = z.infer<typeof taskTransitionSchema>;
export type ProgressEventInput = z.infer<typeof progressEventInputSchema>;
