# Phase 9 progress evidence — Free/Pro billing

Recorded: September 25, 2026

Status: **in progress**. The product-specific Free/Pro model, local checkout/cancellation parity, account UI and entitlement boundaries are implemented and verified. A durable asynchronous provider reconciliation job, configured Stripe test resources and controlled Stripe evidence remain.

## Implemented and proved

- Starter plan names and article/workflow entitlements were removed from the product catalog. Free includes private garden planning; Pro adds `weather.monitoring`.
- Free access does not require a subscription row. The customer billing response returns effective Free access while truthfully retaining a null provider subscription.
- Only Pro can enter checkout. Checkout request IDs are stable idempotency inputs and the Stripe adapter binds organization/plan metadata to both Checkout and Subscription.
- The plan screen shows customer language rather than entitlement codes, handles checkout success/cancellation return states, distinguishes provider subscription state from effective access, and supports checkout, payment-detail management, cancellation and resumption.
- Local billing exercises the same product commands and projection repository as provider mode. Cancel immediately removes paid entitlements while retaining the subscription history; Free garden access is independent of paid entitlements.
- Weather evaluation and notification consumers recheck `weather.monitoring` at execution, so an effective downgrade between queueing and handling prevents new Pro work.
- Existing signed Stripe processing verifies current provider state before projection, uses immutable subscription ownership, serializes organization updates, fences slow reconciliations by generation, ignores replaced subscription identities and atomically projects entitlements with an internal billing event.
- Provider readiness now requires the exact billable product map (`pro`) rather than placeholder Starter/Business prices.
- The product browser path proves no subscription → Free → local Pro checkout → Pro weather capability → cancel → Free, then reloads the previously built garden to prove its saved plan data remains.

## Validation

- `pnpm check` passed: typecheck, all enabled tests and all builds.
- With the local PostgreSQL suites enabled: billing reported 6 passed; Worker reported 120 passed and 17 environment-gated skips.
- Product browser flow: 1 passed in 12.8 seconds, including Free/Pro/cancel and retained-garden assertions.

## Remaining exit evidence

- Move provider subscription retrieval from the webhook request into a durable queued reconciliation job with explicit recovery after provider outage/crash; current receipts and Stripe webhook retry are durable, but provider lookup is still inline.
- Configure the approved Pro price and Stripe test product/price, webhook endpoint and encrypted environment values through Trestle. The checked-in amount remains provisioning input and is not presented as a launch price.
- Run the preview/staging Stripe Checkout path and record signed webhook, current-state retrieval, projection, portal/cancel and effective downgrade evidence.
- Add an explicit browser case where entitlement changes after monitoring work is queued and before its handler executes.
