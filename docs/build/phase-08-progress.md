# Phase 8 progress evidence — notification feed and delivery

Recorded: September 25, 2026

Status: **in progress**. Transition-deduplicated feed entries, email intents, fenced claims, local and daily-digest delivery, urgency-aware preferences, quiet-hour suppression, task applicability and receipt projection are implemented and verified. Affected-crop presentation and controlled staging delivery remain.

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
- Preferences now distinguish urgent warnings, resolutions, routine guidance and daily digests. Digest assembly has one durable identity per garden, recipient and garden-local calendar date, freezes its included recommendation-version IDs, and excludes versions already accepted or delivered as immediate email.
- Reviewed climate-response rules classify delivery as `urgent` or `routine_digest`, with old rules defaulting safely to urgent. The class participates in the material-action fingerprint and is stored on each immutable recommendation version. Routine advice creates the in-app record and daily due work but records its immediate intent as `digest_only`; an integration fixture proves the action appears in the next digest instead of sending immediately.
- A privacy-minimal due-work index schedules each garden-local date for 7 a.m. the following morning. The existing hourly Worker claims due rows with `SKIP LOCKED`; a DST-boundary concurrency fixture proves two schedulers produce one digest and one captured email.
- Digest sending has its own bounded lease, fencing token and stable provider idempotency key. The claim rechecks the recipient's current verification and preferences, removes versions sent immediately since assembly, keeps only the latest version in each recommendation episode, and coalesces duplicate action text before rendering.
- The tenant runtime resolves the household recipient through a narrow `SECURITY DEFINER` function instead of reading the global auth user table. The function returns no row when a tenant asks for another organization, and both immediate and digest delivery run successfully through `trestle_app` permissions.
- Verified Resend receipts also project onto digest delivery state, including delivered, bounced, complained and failed outcomes.
- Delivery claims re-read the current garden risk episode and state in the same transaction as the lease. A warning or material change that has cleared, become unknown or been replaced by another episode is suppressed as `recommendation_superseded`; a stale resolution is likewise suppressed after renewed risk.
- Delivery claims also re-read append-only planting progress. If every affected planting has been harvested or removed, the delivery is suppressed as `affected_plantings_complete`; corrections that invalidate a terminal event prevent suppression.
- Recommendation versions carry task UUIDs separately from planting UUIDs. Delivery claims require every referenced task to belong to the garden, load each task's latest immutable status revision, and suppress as `affected_tasks_complete` only when all are completed or skipped. Missing, malformed and postponed tasks fail open so advice is not silently discarded.
- PostgreSQL integration proves concurrent weather evaluation creates one warning/feed/intent, a delivered warning permits one resolution intent, renewed risk creates one new intent, concurrent claims have one winner, a stale token cannot complete, and an out-of-order accepted receipt cannot regress delivered state.
- The local notification runtime integration proves duplicate handling emits one warning, continuing risk emits none, resolution emits one clear message, an obsolete warning is suppressed before send, and a preference disabled after intent creation is honored before send.
- Lease recovery fixtures prove an expired worker loses its fencing token, a later worker can reclaim the intent, and provider retry reuses the stable provider idempotency key with a new attempt token.
- The product operations report exposes privacy-safe totals for every delivery state, suppression reasons and hourly outcome history for the latest seven days. It does not include recipient addresses or recommendation content.

## Validation

- `pnpm check` passes after the digest scheduler and task-identity changes: all typechecks and builds succeeded; the full Worker suite ran 145 tests. Focused contract, domain, data and Worker suites also pass after urgency classification, including 30 data tests with local PostgreSQL enabled. Coverage includes DST scheduling, concurrent schedulers, concurrent digest claims, routine digest routing, late immediate-send exclusion, task-status suppression, fencing, receipt projection and cross-tenant recipient denial.
- Product browser flow: 1 passed in 17.7 seconds with the notification-preference request present in the garden screen.
- Local PostgreSQL migration `0050_rapid_joseph.sql` applied successfully with forced RLS, tenant/platform grants and the tenant-constrained recipient resolver.

## Remaining exit evidence

- Decide whether a future scheduler should delay non-urgent messages until the quiet window ends. The launch-safe behavior currently suppresses them explicitly rather than scheduling provider delivery that cannot be rechecked at send time.
- Run a controlled staging send to an allowlisted recipient and retain provider acceptance and webhook-delivery evidence separately.
