# Easy Garden Plan — Monitoring and Notification Policy

Status: proposed application policy. Operational defaults below require fixture and staging validation; crop thresholds require reviewed published evidence. No monitoring service has been deployed.

Inputs: [03 — Architecture](03-system-architecture-and-flows.md), [06 — Implementation](06-application-implementation-spec.md), [07 — Data and rules](07-data-and-planting-rule-model.md), [08 — Editor and planning](08-garden-editor-and-planning-behavior.md).

## 1. Product contract

Free includes the seasonal plan, progress history, and general instructions for checking weather and responding to frost. Pro evaluates near-term conditions for the user's planned and actual crops, proposes supported actions, and delivers recommendations in-app and optionally by email.

Weather adjustments never silently rewrite the seasonal baseline or actual planting history. Every recommendation explains the affected crops, relevant period, supporting data and suggested action. A missing alert is not evidence of safe conditions, and a healthy application endpoint does not prove weather monitoring is current.

Launch geography remains all US regions, including Alaska and Hawaii. Missing provider coverage is an explicit monitoring state; do not substitute fabricated forecasts or claim garden-specific frost protection where data is unavailable.

## 2. Scope of initial recommendations

- Crop-specific cold/frost protection for actual plantings with supported stage-specific rules.
- Near-term planting delays or timing suggestions when applicable published rules and available weather support them.
- Relevant official weather notices with source attribution, clearly distinguished from crop-specific evaluations.
- Material corrections or cancellations of previously delivered advice.

Watering, pests, SMS, push notifications and automated shade prediction remain deferred. Air forecasts do not establish soil temperature. If soil measurements are required, ask the gardener to verify them and retain that condition in the recommendation.

Do not infer a universal frost threshold from this spec. Rule versions define supported temperature/exposure requirements and actions. Missing stage, threshold or exposure information produces insufficient-information status rather than invented precision.

## 3. Eligibility and due-work discovery

An eligible garden has current Pro entitlement, monitoring enabled, a supported confirmed location/timezone, and relevant future tasks or active plantings. Email additionally requires a verified recipient, enabled channel and valid subscription/preference state.

Maintain a narrowly authorized operational due-work index containing only what discovery needs. It does not grant unrestricted access to tenant tables. Forecast fetching may be shared by provider location/grid, while garden evaluation always runs through verified tenant context.

On activation, planting progress, material location change or entitlement change, update monitoring eligibility and request a fresh evaluation where appropriate. Downgrade stops new paid evaluations and unsent paid advice; prior history remains readable.

A location change invalidates the old forecast association. Do not evaluate a relocated garden using cached data from its former location.

## 4. Forecast and official-alert records

Store normalized immutable snapshots with provider identity, source location/grid, issuance/update time when supplied, retrieval time, valid interval, units, content fingerprint and normalization version. Preserve the difference between retrieval freshness and source freshness.

Official alerts retain provider identifiers, revisions, affected geography, effective/onset/expiry times, cancellation state and source link where available. Match the confirmed garden location against supported affected-area data. Never relabel a broad official warning as a precise measurement at the garden.

Normalize all physical quantities before rule evaluation. Keep missing fields explicit. A weather snapshot used to produce advice must remain identifiable in its history even after a newer forecast arrives.

## 5. Initial operational defaults

These are proposed application settings, not claims about provider guarantees:

| Setting | Initial policy |
|---|---|
| Forecast refresh | Approximately hourly for eligible locations; reuse a suitable shared snapshot |
| Official-alert refresh | Target every 15 minutes, subject to provider guidance and measured capacity |
| Forecast cache freshness | Retrieved within 2 hours, plus valid coverage for the evaluated period |
| Official-alert check freshness | Last successful check within 30 minutes |
| Failure retries | Bounded exponential backoff with jitter; honor provider retry guidance |
| Routine digest | Once daily at 7 a.m. in the garden timezone |
| Quiet hours | 9 p.m. to 7 a.m. in the garden timezone |

Also validate source issuance/update age through the adapter's documented semantics. A newly retrieved but old forecast is not automatically fresh. Set and test the provider-specific source-age bound before live advice is enabled; do not hard-code an undocumented provider assumption here.

Only evaluate within the actual usable forecast horizon. Do not extrapolate a daily minimum into hourly exposure or treat a partial forecast as covering missing intervals. Official alerts can retain a valid provider expiry while the last-check timestamp is stale; show both facts and do not claim cancellation status is current.

Scheduled cadence is a target, not a delivery SLA. Monitor actual delay and capacity. Stale monitoring preserves the baseline plan and shows the last successful check. Never emit reassuring all-clear language from a failed fetch.

## 6. Evaluation pipeline

1. Verify event provenance, tenant authority and current entitlement.
2. Reload current garden, active plan, actual plantings and task revisions.
3. Resolve the latest usable forecast/alert snapshots and applicable published crop rules.
4. Evaluate only rules whose required inputs are known and supported.
5. Produce typed risk/action candidates with affected items, valid period, evidence and uncertainty.
6. Compare candidates with existing recommendation episodes.
7. Atomically persist new/changed recommendation state and outbox events.

Weather conditions can justify a delay without identifying a safe replacement date. In that case recommend postponement and reevaluation; do not select the next day merely because it is available. Advice to advance planting requires explicit support from the relevant seasonal and environmental rules.

No actionable candidate is different from a verified absence of risk. Record evaluation status such as evaluated, insufficient inputs, stale data or unavailable coverage. The UI must not translate every empty result into “safe.”

## 7. Recommendation identity and lifecycle

A recommendation episode groups one action category affecting a stable garden/crop-or-task set over an overlapping hazard period. Provider alert IDs may anchor official-alert episodes; crop-risk episodes use a persisted application identity. Match revised periods to open episodes before creating new ones so small forecast shifts do not create repeated alerts.

Each material change creates a recommendation version. Preserve original evidence and delivery history. States are open, accepted, dismissed, superseded and expired. Delivery state is separate.

Material changes include a different required action, newly affected crops, a changed action deadline relevant to the user, a supported escalation, or cancellation/correction of previously sent advice. Mere retrieval time, wording, or unchanged numerical variation does not justify another email. Rule-specific tolerances belong to reviewed policy configuration and tests.

A dismissal suppresses reminders for that version. A genuinely material escalation may create a new version with an explanation. Acceptance records what the user agreed to do; it does not guarantee the protective action succeeded.

### Persisted risk state and transition notifications

Maintain a persisted risk state per garden, hazard category and affected crop/stage group, separate from notification delivery state. Track `unknown`, `clear`, `active` and `resolved`, together with the current episode, supporting snapshot, last evaluated time and revision. `Clear` means no supported risk in the evaluated scope/window, not a guarantee of safety. `Resolved` closes a previously active episode; later clean evaluations may settle to clear without another email.

- Unknown/clear → active: open an episode and notify once when actionable.
- Active → active: update evidence silently unless the required action materially changes.
- Active → resolved: close the episode and create a resolution notification for recipients who were sent its warning, subject to current channel preferences and eligibility.
- Active → unknown because data is stale or unavailable: retain the last known active episode and show monitoring uncertainty. Never issue a resolution notice from missing data.
- Resolved/clear → active: reopen or create an episode according to the overlapping hazard-window rule, and send a renewed-risk notice if the prior warning was resolved.

Persist transition identity and state revision atomically with the outbox event. Delivery deduplication uses that transition identity so warning and resolution messages are distinct, while repeated evaluations of either transition cannot resend it. Retain per-recipient warning delivery history; do not send an unexplained resolution email to someone who never received or had a warning accepted by the provider. Ambiguous warning outcomes require reconciliation rather than assuming delivery.

Avoid rapid active/clear oscillation by using a reviewed resolution policy with hysteresis or repeated fresh confirming snapshots. Exact temperature margins and confirmation intervals must be defined and tested by hazard policy; do not invent horticultural thresholds here. An authoritative official cancellation can resolve that official notice but cannot independently clear crop-specific forecast risk.

Use wording such as “The forecast frost risk for this period has passed” or “The earlier warning was canceled,” according to the actual evidence. Do not say frost is impossible, or advise removing protection, unless the evaluated conditions and published action rules support that conclusion. Resolution of one crop/group does not clear another still-active risk; aggregate the message to explain remaining affected crops.

Acceptance tests must cover warning → repeated risk → resolution → repeated clear → renewed risk, missing-data interruptions, partial crop-group resolution, concurrent evaluations, and forecasts alternating around the threshold. Each meaningful transition has at most one logical email intent per recipient.

## 8. Channel preferences and urgency

The in-app feed records valid recommendations as soon as they are committed. Email is optional and separately configurable for urgent protection, routine planning guidance and digests. Provide an easy preference/unsubscribe path that preserves required account/security communications separately.

Proposed defaults: routine advice is included in the daily digest; actionable protection advice may send promptly outside quiet hours. Quiet hours are respected unless the user explicitly enables urgent overnight delivery. If waiting would miss the action window, show the advice in-app immediately and record email suppression/delay honestly; do not silently override the preference.

Classify urgency from the supported action and remaining useful response window, not dramatic wording. Do not classify every official notice as an urgent crop-specific email.

For multiple gardens, keep evaluation in each garden's timezone. Initially send garden-specific notifications rather than combining incompatible timezones into a single digest. Handle daylight-saving changes without duplicate daily digests; identify a digest by garden, recipient and local calendar date.

Email subject/body must identify the garden using its user-facing name, affected crops, the action window and reason. Avoid exposing a full home address. Links open the current recommendation, where corrections and supersession are visible.

## 9. Delivery and deduplication

Commit a recommendation version and event together. Create a delivery intent keyed by recommendation version, recipient and channel, with a unique database constraint. Digests have their own stable daily identity and immutable included-version list.

Immediately before sending, recheck entitlement, recipient preference, recommendation validity, affected planting/task state and any newer superseding version. Suppress advice that has expired or no longer applies. Retries reload these checks rather than blindly resending the original payload.

Use the email adapter's stable idempotency key for retries of the same intent. Respect the provider's actual idempotency lifetime; after an ambiguous outcome beyond that lifetime, reconcile or expose the uncertainty instead of assuming another send is duplicate-free.

Track queued, sending, provider-accepted, delivered, bounced, suppressed, failed and unknown outcomes. Verify and deduplicate provider receipts before projection. Receipt arrival order must not incorrectly regress final delivery state; preserve raw normalized receipt history for diagnosis with restricted access.

A provider acceptance is not confirmed delivery. Bounces update channel usability without deleting the in-app recommendation. Failures remain inspectable with bounded retries. Never claim exactly-once email.

### Execution choice and concurrency

Use Trestle's existing Queue/outbox runtime and PostgreSQL for the initial implementation. Do not add Inngest or Durable Objects solely for notification deduplication. A future scheduler may use either without changing the durable recommendation/delivery identities. The database remains the authority for whether an episode or delivery already exists.

Serialize episode matching/creation for each garden and action category using a database transaction and an appropriate lock. Within that transaction, match the affected set and overlapping hazard period, update or create the episode, and emit only the material-change event. A uniqueness constraint on a forecast version alone is insufficient: successive forecasts can describe the same underlying hazard.

Claim delivery intents atomically with a bounded lease and attempt token. Concurrent workers cannot both claim the same active intent. Fence completion writes against the claim token and reuse the same provider idempotency identity after ambiguous outcomes. A lease alone cannot stop a paused worker from making a late external request; provider idempotency and the documented unknown-outcome recovery policy remain necessary.

Coalesce affected crops for the same garden/action episode into one message instead of one message per crop. Before a digest is assembled, exclude recommendation versions already delivered through immediate email. Before any send, recheck whether another channel schedule already fulfilled that same email intent. An in-app entry plus its opted-in email is intentional channel delivery, not two independent alerts.

Default behavior is one initial email per episode, with follow-up only for a material action change or correction. Repeated checks and ordinary reminders do not send another copy. Keep a persisted episode delivery history so restarts, retries and new forecast versions cannot reset this decision.

## 10. Corrections, expiry and user actions

Opening an old email always shows current state alongside the original advice. A material correction to delivered advice may generate a new delivery intent under current preferences, with clear explanation of what changed. Do not silently edit history.

An official cancellation or a lower forecast risk does not prove that every crop is safe; state the specific change and its scope. Withdrawn crop rules invalidate dependent open advice where necessary and request review/recalculation.

Accepting a reschedule checks expected task revision and current recommendation validity atomically. Change only future work; preserve baseline and actual progress. If another tab already completed the task, return a conflict and show current state.

Recommendations expire when their action is no longer useful or their inputs become invalid. Expiry prevents future sends/acceptance but preserves history. Removing a planting, deleting a garden or disabling monitoring suppresses affected pending intents.

## 11. Event age and recovery

Adopt the framework's enforced 14-day lifetime measured from persisted event commit time. Every private start, retry and Workflow resume verifies age and current authority. Provenance retention is 30 days; retaining a row does not extend permission to execute it.

The product's advice lifetime is usually much shorter than the framework maximum. An event younger than 14 days can still carry expired advice and must be suppressed.

After expired or irrecoverable work, an authorized recovery operation creates a fresh evaluation from current garden and weather state. It never changes the timestamp on an old message or replays obsolete email as new work. Long-running operational jobs checkpoint and create fresh authorized work when needed.

## 12. Operations and acceptance

Track forecast/source freshness, eligible locations overdue for refresh, evaluation backlog, detection-to-feed and detection-to-provider-acceptance latency, deduplication/suppression counts, expired provenance, provider errors and delivery outcomes. Correlate with event IDs in restricted logs without private payloads or exact home coordinates.

Required scenarios:

- A supported cold-risk fixture creates one appropriate crop-specific recommendation.
- Unchanged forecasts, duplicate messages and overlapping scheduler runs do not duplicate advice or logical deliveries.
- A materially revised forecast updates an existing episode and retains history.
- Stale source data, fresh retrieval of old data, missing hourly coverage and provider outages cannot produce unsupported certainty.
- Quiet hours, explicit urgent opt-in, timezones and daylight-saving transitions follow the declared policy.
- Downgrade, unsubscribe, task completion and garden deletion between queueing and sending suppress stale deliveries.
- Provider timeout, retry, duplicate receipt and out-of-order receipt behavior preserve truthful state.
- A resumed Workflow past the commit-age boundary cannot execute; fresh authorized recovery evaluates current conditions.
- Delayed or canceled official alerts preserve their distinct source and freshness states.
- Representative Alaska, Hawaii, frost-free and multi-season fixtures are exercised alongside other US climate cases.

Use fixed clocks and normalized synthetic/recorded fixtures for repeatable policy tests, real PostgreSQL for transactional/deduplication behavior, and controlled staging recipients for provider proof. Validate actual provider freshness semantics and crop thresholds before enabling live recommendations. Pricing and commercial guarantees are outside this policy spec.
