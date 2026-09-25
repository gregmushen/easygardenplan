import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string().min(1),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export * from "./resources/garden.js";
export * from "./knowledge.js";
export * from "./location.js";
export * from "./geometry.js";
export * from "./planning.js";
export * from "./progress.js";
