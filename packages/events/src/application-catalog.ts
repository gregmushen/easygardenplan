import { z } from "zod";

import { defineEvent, defineEventCatalog } from "./catalog.js";

// Application-owned event definitions belong here. Internal events do not
// become customer-visible until they declare an explicit webhook projection.
const billingSubscriptionPayload = z.object({
  organizationId: z.string().min(1),
  plan: z.string().min(1),
  planVersion: z.number().int().positive(),
  status: z.enum(["active", "trialing", "past_due", "cancelled", "incomplete"]),
  entitlements: z.array(z.string().min(1)),
  previousPlan: z.string().min(1).optional(),
  previousStatus: z.string().min(1).optional(),
  cancelAtPeriodEnd: z.boolean(),
  currentPeriodEnd: z.iso.datetime().optional(),
});

function billingSubscriptionEvent(name: string, description: string) {
  return defineEvent({ name, schemaVersion: 1, description,
    resource: { type: "organization", id: (payload: z.infer<typeof billingSubscriptionPayload>) => payload.organizationId },
    payload: billingSubscriptionPayload, sensitivity: "confidential" });
}

export const billingSubscriptionActivatedEvent = billingSubscriptionEvent("billing.subscription.activated", "An organization subscription became active");
export const billingSubscriptionUpdatedEvent = billingSubscriptionEvent("billing.subscription.updated", "An organization subscription changed");
export const billingSubscriptionCancelledEvent = billingSubscriptionEvent("billing.subscription.cancelled", "An organization subscription was cancelled");
export const billingSubscriptionPastDueEvent = billingSubscriptionEvent("billing.subscription.past_due", "An organization subscription became past due");

const billingCheckoutPayload = z.object({ organizationId: z.string().min(1), currentSubscription: z.boolean(),
  paymentStatus: z.enum(["paid", "unpaid", "no_payment_required"]).optional() });
export const billingCheckoutCompletedEvent = defineEvent({ name: "billing.checkout.completed", schemaVersion: 1,
  description: "A verified subscription Checkout session completed", sensitivity: "confidential",
  resource: { type: "organization", id: (payload: z.infer<typeof billingCheckoutPayload>) => payload.organizationId },
  payload: billingCheckoutPayload });

const billingInvoicePayload = z.object({ organizationId: z.string().min(1), currentSubscription: z.boolean(),
  amountMinor: z.number().int(), currency: z.string().regex(/^[a-z]{3}$/u) });
function billingInvoiceEvent(name: string, description: string) {
  return defineEvent({ name, schemaVersion: 1, description, sensitivity: "confidential",
    resource: { type: "organization", id: (payload: z.infer<typeof billingInvoicePayload>) => payload.organizationId },
    payload: billingInvoicePayload });
}
export const billingInvoicePaidEvent = billingInvoiceEvent("billing.invoice.paid", "A subscription invoice was paid");
export const billingInvoicePaymentFailedEvent = billingInvoiceEvent("billing.invoice.payment_failed", "A subscription invoice payment failed");

export const gardenCreatedApplicationEvent = defineEvent({
  name: "resource.garden.created", schemaVersion: 1,
  description: "A Garden resource was created.", sensitivity: "internal",
  payload: z.object({ resourceId: z.uuid() }),
  resource: { type: "garden", id: (payload: { resourceId: string }) => payload.resourceId },

});
export const gardenUpdatedApplicationEvent = defineEvent({
  name: "resource.garden.updated", schemaVersion: 1,
  description: "A Garden resource was updated.", sensitivity: "internal",
  payload: z.object({ resourceId: z.uuid(), revision: z.number().int().positive() }),
  resource: { type: "garden", id: (payload: { resourceId: string }) => payload.resourceId },

});
export const gardenDeletedApplicationEvent = defineEvent({
  name: "resource.garden.deleted", schemaVersion: 1,
  description: "A Garden resource was deleted.", sensitivity: "internal",
  payload: z.object({ resourceId: z.uuid(), revision: z.number().int().positive() }),
  resource: { type: "garden", id: (payload: { resourceId: string }) => payload.resourceId },

});
export const weatherEvaluationRequestedEvent = defineEvent({
  name: "garden.weather_evaluation.requested", schemaVersion: 1,
  description: "A private garden requested a fresh weather evaluation", sensitivity: "confidential",
  payload: z.object({ gardenId: z.uuid(), reason: z.enum(["manual", "scheduled", "plan_activated", "progress_recorded", "location_changed", "recovery"]), requestedAt: z.iso.datetime() }),
  resource: { type: "garden", id: (payload: { gardenId: string }) => payload.gardenId },
});
export const recommendationTransitionedEvent = defineEvent({
  name: "garden.recommendation.transitioned", schemaVersion: 1,
  description: "A garden recommendation entered a meaningful new state", sensitivity: "confidential",
  payload: z.object({ gardenId: z.uuid(), episodeId: z.uuid(), recommendationVersionId: z.uuid(), transitionId: z.uuid(), kind: z.enum(["warning", "material_change", "resolution", "renewed_warning"]), riskRevision: z.number().int().positive() }),
  resource: { type: "garden", id: (payload: { gardenId: string }) => payload.gardenId },
});
// trestle:resource-event-definitions
export const applicationEventCatalog = defineEventCatalog([
  billingSubscriptionActivatedEvent,
  billingSubscriptionUpdatedEvent,
  billingSubscriptionCancelledEvent,
  billingSubscriptionPastDueEvent,
  billingCheckoutCompletedEvent,
  billingInvoicePaidEvent,
  billingInvoicePaymentFailedEvent,
  gardenCreatedApplicationEvent,
  gardenUpdatedApplicationEvent,
  gardenDeletedApplicationEvent,
  weatherEvaluationRequestedEvent,
  recommendationTransitionedEvent,
  // trestle:resource-event-list
]);
