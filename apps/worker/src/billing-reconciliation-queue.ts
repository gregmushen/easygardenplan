import type { AuthEnvironment } from "@easygardenplan/auth";
import { getPlan, planEntitlements } from "@easygardenplan/billing";
import { applyBillingProviderEvent, markBillingReconciliationUnavailable } from "@easygardenplan/db";
import type { QueueBatchMessage } from "@easygardenplan/events";
import { retrieveCurrentStripeSubscription, type NormalizedBillingEvent } from "@easygardenplan/integrations";

export type BillingReconciliationWakeup = Readonly<{
  kind: "billing-subscription-reconciliation";
  provider: "stripe";
  providerEventId: string;
  providerSubscriptionId: string;
  eventType: NormalizedBillingEvent["type"];
  occurredAt: string;
  generation: number;
  correlationId: string;
}>;

export function looksLikeBillingReconciliationWakeup(value: unknown): value is BillingReconciliationWakeup {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.kind === "billing-subscription-reconciliation" && item.provider === "stripe"
    && typeof item.providerEventId === "string" && /^evt_[A-Za-z0-9_]+$/u.test(item.providerEventId)
    && typeof item.providerSubscriptionId === "string" && /^sub_[A-Za-z0-9_]+$/u.test(item.providerSubscriptionId)
    && typeof item.eventType === "string" && item.eventType.startsWith("Subscription")
    && typeof item.occurredAt === "string" && Number.isFinite(new Date(item.occurredAt).getTime())
    && Number.isSafeInteger(item.generation) && Number(item.generation) > 0
    && typeof item.correlationId === "string" && item.correlationId.length > 0 && item.correlationId.length <= 128;
}

export async function reconcileBillingSubscription(wakeup: BillingReconciliationWakeup, environment: AuthEnvironment): Promise<void> {
  if (!environment.STRIPE_SECRET_KEY || environment.STRIPE_MODE === "local") throw new Error("Stripe reconciliation is not configured");
  let current: NormalizedBillingEvent;
  try {
    current = await retrieveCurrentStripeSubscription({ secretKey: environment.STRIPE_SECRET_KEY, event: { id: wakeup.providerEventId, type: wakeup.eventType, providerSubscriptionId: wakeup.providerSubscriptionId, occurredAt: new Date(wakeup.occurredAt) } });
  } catch (error) {
    await markBillingReconciliationUnavailable({ databaseUrl: environment.DATABASE_URL, ...(environment.DATABASE_DRIVER ? { driver: environment.DATABASE_DRIVER } : {}), provider: wakeup.provider, providerEventId: wakeup.providerEventId }).catch(() => undefined);
    throw error;
  }
  const plan = current.plan ? getPlan(current.plan) : undefined;
  if (!current.organizationId || !current.status || !current.plan || !plan) throw new Error("Current Stripe subscription lacks a known organization or plan");
  await applyBillingProviderEvent({ databaseUrl: environment.DATABASE_URL, ...(environment.DATABASE_DRIVER ? { driver: environment.DATABASE_DRIVER } : {}), provider: wakeup.provider, providerEventId: wakeup.providerEventId, type: current.type, correlationId: wakeup.correlationId,
    reconciliation: { providerSubscriptionId: wakeup.providerSubscriptionId, generation: wakeup.generation }, projection: {
      organizationId: current.organizationId, ...(current.providerCustomerId ? { providerCustomerId: current.providerCustomerId } : {}), providerSubscriptionId: wakeup.providerSubscriptionId,
      plan: current.plan, planVersion: plan.version, status: current.status, ...(current.cancelAtPeriodEnd !== undefined ? { cancelAtPeriodEnd: current.cancelAtPeriodEnd } : {}),
      ...(current.currentPeriodStart ? { currentPeriodStart: current.currentPeriodStart } : {}), ...(current.currentPeriodEnd ? { currentPeriodEnd: current.currentPeriodEnd } : {}),
      entitlements: current.status === "active" || current.status === "trialing" ? [...(planEntitlements[current.plan as keyof typeof planEntitlements] ?? [])] : [],
    },
  });
}

export async function consumeBillingReconciliationMessages(input: { messages: QueueBatchMessage[]; environment: AuthEnvironment }): Promise<{ acknowledged: number; retried: number }> {
  let acknowledged = 0; let retried = 0;
  for (const message of input.messages) {
    if (!looksLikeBillingReconciliationWakeup(message.body)) { message.retry(); retried++; continue; }
    try { await reconcileBillingSubscription(message.body, input.environment); message.ack(); acknowledged++; }
    catch { message.retry({ delaySeconds: 60 }); retried++; }
  }
  return { acknowledged, retried };
}
