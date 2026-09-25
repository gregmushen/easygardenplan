# Phase 8 progress evidence — notification feed and delivery

Recorded: September 25, 2026

Status: **in progress**. Transition-deduplicated feed entries, email intents, fenced claims, local delivery, preferences and receipt projection are implemented and verified. Digests, quiet-hour scheduling, the remaining pre-send suppression cases and controlled staging delivery remain.

## Implemented and proved

- Recommendation version, semantic transition, in-app feed entry, delivery intent and committed outbox event are created in one PostgreSQL transaction.
- The database permits one email intent per transition, recipient and channel and gives that intent a stable provider idempotency key.
- Only a verified household owner receives an intent. Warning/material-change/renewed-warning and resolution preferences are evaluated when the intent is created and rechecked immediately before delivery.
- Resolution email is created only when that same recipient has an accepted or delivered warning in the episode. Ambiguous or unsent warnings suppress the resolution email.
- A bounded lease and random attempt token serialize concurrent claims. Completion is fenced by that token; an expired worker cannot overwrite a later attempt.
- Queue retries reuse the intent's provider idempotency key. The local adapter's existing idempotency store makes a provider-accepted retry return the original receipt.
- The `garden.recommendation.transitioned` consumer declares tenant authority and requires the current `weather.monitoring` entitlement, so the framework rechecks provenance and paid access before the handler runs.
- Verified Resend receipts project onto the delivery intent. Accepted and failed events cannot regress a delivered status, while later bounce/complaint outcomes remain recordable.
- Notification preferences have authenticated read/update endpoints and gardener-facing controls for warnings and resolution messages. Quiet-hour fields are validated and stored for the forthcoming scheduler.
- PostgreSQL integration proves concurrent weather evaluation creates one warning/feed/intent, a delivered warning permits one resolution intent, renewed risk creates one new intent, concurrent claims have one winner, a stale token cannot complete, and an out-of-order accepted receipt cannot regress delivered state.

## Validation

- `pnpm check`: typecheck and all suites passed after the webhook mock was updated for receipt projection; the focused Worker suite reports 120 passed and 17 environment-gated skips.
- Product browser flow: 1 passed in 12.1 seconds with the notification-preference request present in the garden screen.
- Local PostgreSQL migration `0046_brainy_bloodstorm.sql` applied successfully with forced RLS and tenant runtime grants.

## Remaining exit evidence

- Implement routine/digest aggregation and prove immediately emailed versions cannot appear in a digest.
- Enforce timezone-aware quiet hours with an urgent-overnight policy and test boundary/DST cases.
- Recheck supersession, planting/task completion and garden deletion immediately before send; entitlement downgrade is already enforced by the event runtime.
- Add explicit lease-expiry and provider-timeout integration fixtures beyond the current concurrent/fenced claim proof.
- Expose delivery outcome history to operators, including suppressed, bounce, complaint and permanently failed cases.
- Run a controlled staging send to an allowlisted recipient and retain provider acceptance and webhook-delivery evidence separately.
