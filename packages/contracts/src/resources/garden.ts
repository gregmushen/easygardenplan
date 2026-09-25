import { z } from "zod";

export const gardenCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  latitude: z.string().trim().min(1).max(200).optional(),
  longitude: z.string().trim().min(1).max(200).optional(),
  timezone: z.string().trim().min(1).max(200).optional(),
  locationSource: z.enum(["geocoded", "manual_pin"]).optional(),
  locationProviderPlaceId: z.string().trim().min(1).max(500).optional(),
  formattedAddress: z.string().trim().min(1).max(500).optional(),
  units: z.string().trim().min(1).max(200).optional(),
  conditions: z.string().max(10000).optional(),
  monitoringEnabled: z.boolean().optional(),
  locationConfirmed: z.boolean().optional(),
});
export const gardenUpdateSchema = gardenCreateSchema.partial().refine((value) => Object.keys(value).length > 0, "at least one field is required");
export const gardenSchema = z.object({
  name: z.string().trim().min(1).max(200),
  latitude: z.string().trim().min(1).max(200).nullable(),
  longitude: z.string().trim().min(1).max(200).nullable(),
  timezone: z.string().trim().min(1).max(200).nullable(),
  locationSource: z.enum(["geocoded", "manual_pin"]).nullable(),
  locationProviderPlaceId: z.string().trim().min(1).max(500).nullable(),
  formattedAddress: z.string().trim().min(1).max(500).nullable(),
  units: z.string().trim().min(1).max(200).nullable(),
  conditions: z.string().max(10000).nullable(),
  monitoringEnabled: z.boolean().nullable(),
  locationConfirmed: z.boolean().nullable(),
  id: z.string().uuid(),
  organizationId: z.string().min(1),
  revision: z.number().int().positive(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Garden = z.infer<typeof gardenSchema>;
export type CreateGarden = z.infer<typeof gardenCreateSchema>;
export type UpdateGarden = z.infer<typeof gardenUpdateSchema>;
