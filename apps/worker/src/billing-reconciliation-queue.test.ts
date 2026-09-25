import { describe, expect, it } from "vitest";

import { looksLikeBillingReconciliationWakeup } from "./billing-reconciliation-queue.js";

describe("billing reconciliation wake-up", () => {
  const valid = { kind: "billing-subscription-reconciliation", provider: "stripe", providerEventId: "evt_123", providerSubscriptionId: "sub_123", eventType: "SubscriptionUpdated", occurredAt: "2026-09-25T00:00:00.000Z", generation: 1, correlationId: "corr-1" };
  it("accepts only bounded signed-receipt identities", () => {
    expect(looksLikeBillingReconciliationWakeup(valid)).toBe(true);
    for (const changed of [{ ...valid, providerEventId: "bad" }, { ...valid, providerSubscriptionId: "bad" }, { ...valid, generation: 0 }, { ...valid, occurredAt: "invalid" }, { ...valid, eventType: "InvoicePaid" }]) expect(looksLikeBillingReconciliationWakeup(changed)).toBe(false);
  });
});
