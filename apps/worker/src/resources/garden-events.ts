import { applicationEventCatalog, type EventDefinition, type EventEnvelope } from "@easygardenplan/events";
import type { EventHandlerContext } from "../async-runtime.js";

export type GardenCreatedPayload = { resourceId: string };
export type GardenUpdatedPayload = { resourceId: string; revision: number };
export type GardenDeletedPayload = { resourceId: string; revision: number };

export const gardenCreatedEvent: EventDefinition<GardenCreatedPayload> = {
  name: "resource.garden.created",
  schemaVersion: 1,
  parse(payload: unknown): GardenCreatedPayload {
    return applicationEventCatalog.parse("resource.garden.created", 1, payload) as GardenCreatedPayload;
  },
};
export const gardenUpdatedEvent: EventDefinition<GardenUpdatedPayload> = {
  name: "resource.garden.updated",
  schemaVersion: 1,
  parse(payload: unknown): GardenUpdatedPayload {
    return applicationEventCatalog.parse("resource.garden.updated", 1, payload) as GardenUpdatedPayload;
  },
};
export const gardenDeletedEvent: EventDefinition<GardenDeletedPayload> = {
  name: "resource.garden.deleted",
  schemaVersion: 1,
  parse(payload: unknown): GardenDeletedPayload {
    return applicationEventCatalog.parse("resource.garden.deleted", 1, payload) as GardenDeletedPayload;
  },
};

// Runs only for the committed event, scoped to its tenant: use context.data for tenant reads and writes. Keep external side effects idempotent.
export async function handleGardenCreated(payload: GardenCreatedPayload, envelope: EventEnvelope, _environment: unknown, context: EventHandlerContext): Promise<void> {
  context.log.info("resource.garden.created.consumed", {
    resourceId: payload.resourceId, eventId: envelope.id, organizationId: context.organizationId,
  });
}
export async function handleGardenUpdated(payload: GardenUpdatedPayload, envelope: EventEnvelope, _environment: unknown, context: EventHandlerContext): Promise<void> {
  context.log.info("resource.garden.updated.consumed", {
    resourceId: payload.resourceId, revision: payload.revision, eventId: envelope.id, organizationId: context.organizationId,
  });
}
export async function handleGardenDeleted(payload: GardenDeletedPayload, envelope: EventEnvelope, _environment: unknown, context: EventHandlerContext): Promise<void> {
  context.log.info("resource.garden.deleted.consumed", {
    resourceId: payload.resourceId, revision: payload.revision, eventId: envelope.id, organizationId: context.organizationId,
  });
}
