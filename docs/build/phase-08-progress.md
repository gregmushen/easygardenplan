# Phase 8 progress evidence — notification feed and delivery

Recorded: September 25, 2026

Status: **in progress**. Transition-deduplicated feed entries, email intents, fenced claims, local delivery, preferences, quiet-hour suppression and receipt projection are implemented and verified. Digests, routine-guidance classification, task-level applicability and controlled staging delivery remain.

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
- Gardeners can set a quiet window in the garden timezone and separately allow urgent protection messages overnight. Warning delivery obeys that override; resolutions and warnings without the override are suppressed as `quiet_hours` while the in-app history remains available. Overnight, daytime, DST-boundary and all-day-window fixtures cover the time calculation.
- Delivery claims re-read the current garden risk episode and state in the same transaction as the lease. A warning or material change that has cleared, become unknown or been replaced by another episode is suppressed as `recommendation_superseded`; a stale resolution is likewise suppressed after renewed risk.
- Delivery claims also re-read append-only planting progress. If every affected planting has been harvested or removed, the delivery is suppressed as `affected_plantings_complete`; corrections that invalidate a terminal event prevent suppression.
- PostgreSQL integration proves concurrent weather evaluation creates one warning/feed/intent, a delivered warning permits one resolution intent, renewed risk creates one new intent, concurrent claims have one winner, a stale token cannot complete, and an out-of-order accepted receipt cannot regress delivered state.
- The local notification runtime integration proves duplicate handling emits one warning, continuing risk emits none, resolution emits one clear message, an obsolete warning is suppressed before send, and a preference disabled after intent creation is honored before send.
- Lease recovery fixtures prove an expired worker loses its fencing token, a later worker can reclaim the intent, and provider retry reuses the stable provider idempotency key with a new attempt token.
- The product operations report exposes privacy-safe totals for every delivery state, suppression reasons and hourly outcome history for the latest seven days. It does not include recipient addresses or recommendation content.

## Validation

- `pnpm check`: typecheck and all suites passed after the webhook mock was updated for receipt projection; the focused Worker suite reports 120 passed and 17 environment-gated skips.
- Product browser flow: 1 passed in 12.1 seconds with the notification-preference request present in the garden screen.
- Local PostgreSQL migration `0046_brainy_bloodstorm.sql` applied successfully with forced RLS and tenant runtime grants.

## Remaining exit evidence

- Implement routine/digest aggregation and prove immediately emailed versions cannot appear in a digest.
- Decide whether a future scheduler should delay non-urgent messages until the quiet window ends. The launch-safe behavior currently suppresses them explicitly rather than scheduling provider delivery that cannot be rechecked at send time.
- Define task-level applicability for recommendations that identify tasks rather than plantings. Planting completion, supersession and preferences are rechecked in the claim transaction, garden deletion cascades pending intents, and entitlement downgrade is enforced by the event runtime.
- Run a controlled staging send to an allowlisted recipient and retain provider acceptance and webhook-delivery evidence separately.
