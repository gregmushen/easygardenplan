import { z } from "zod";
import { coordinateSchema } from "./location.js";

export const metricPointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
export const metricRingSchema = z.array(metricPointSchema).min(3).max(500);
export const bedGeometrySchema = z.object({
  outer: metricRingSchema,
  exclusions: z.array(metricRingSchema).max(50).default([]),
});
export const geographicTransformSchema = z.object({
  anchor: coordinateSchema,
  rotationRadians: z.number().finite().default(0),
  scale: z.number().finite().positive().default(1),
  translationMeters: metricPointSchema.default({ x: 0, y: 0 }),
  projection: z.literal("local_equirectangular_v1"),
});
export const sunlightObservationSchema = z.object({
  observedOn: z.string().date(),
  hours: z.number().min(0).max(24).nullable(),
  category: z.enum(["full_sun", "part_sun", "part_shade", "full_shade", "unknown"]),
  note: z.string().max(500).optional(),
});
export const bedRevisionInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  geometry: bedGeometrySchema,
  transform: geographicTransformSchema,
  measurementProvenance: z.enum(["map_drawn", "measured", "calibrated"]),
  sunlight: z.array(sunlightObservationSchema).max(100).default([]),
  expectedRevision: z.number().int().nonnegative(),
});
export type MetricPoint = z.infer<typeof metricPointSchema>;
export type BedGeometry = z.infer<typeof bedGeometrySchema>;
export type GeographicTransform = z.infer<typeof geographicTransformSchema>;
