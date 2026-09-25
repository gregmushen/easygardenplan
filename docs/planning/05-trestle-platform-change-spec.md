# Trestle platform changes — implementation specification

Date: September 24, 2026  
Status: proposed implementation contract; no platform code changed.  
Baseline: Trestle `main` at `51bf4d6500657c240515955881eeb9f556cd5925` (`0.1.0-alpha.42`).  
Source assessment: [04 — Capability map and project structure](04-trestle-capability-map-and-project-structure.md).

## PR-first completion check — remote main `f959439`

Checked PRs and current source after PR #188 merged. This supersedes any assumption that all five platform changes are complete.

- **P1:** [PR #186](https://github.com/gregmushen/trestlejs/pull/186) is merged with successful CI. Its description explicitly excludes the preflight and replacement migration for existing ID-only relationships. New generated relations have the core protection; existing-app adoption is still open. The PR reports real PostgreSQL evidence; this review did not rerun it.
- **P3:** [PR #185](https://github.com/gregmushen/trestlejs/pull/185) is merged with successful CI. Core behavior and adoption notes are present. No additional gap identified in this check.
- **P2:** Open. `EventConsumerRegistry.handle` still passes the parsed queue envelope directly to application handlers; no general committed-event/tenant-context boundary was added.
- **P5:** Open. `pruneSucceeded` still deletes by publishing status and cutoff alone, without downstream completion or supported replay-window protection.
- **P4:** Core ordering protection is present, but the Worker still fetches Stripe state inside the webhook request and skips that reconciliation in local mode. Durable queued reconciliation and local-adapter parity remain open.
- **New adoption consideration:** [PR #188](https://github.com/gregmushen/trestlejs/pull/188) is merged with successful CI. Setup now uses `trestle plan init`; the setup console is removed, `@trestlejs/core` is folded into `trestlejs`, and queue/workflow/admin and other experimental commands require explicit opt-in. Update scaffold instructions accordingly.

No framework code changed in this review. CI conclusions were checked through GitHub; source was inspected at the fetched remote-main revision. Full upgrade, database, and deployed-provider suites were not independently rerun.

## Current-main review — September 24, 2026

Reviewed remote `main` at **`3a0f542e64001a054ac231b13fae6fbfd6df2b01`** after fetching origin. Local `main` still points to the original baseline; no branch was switched or reset. The original requirements below remain acceptance criteria, **not a list of wholly unimplemented work**. This status and sequence supersede the original delivery sequence.

| Change | Updated disposition |
|---|---|
| P1 | Core generator fix merged in PR #186 (`0e42102`): composite tenant keys, target validation, and column-specific SET NULL handling. Adopt and verify existing-project migration guidance and the full acceptance matrix; do not implement a duplicate fix. |
| P2 | Still needed for general application handlers. Current committed-event checks remain webhook-specific; preserve and reuse their newer implementation. |
| P3 | Core fix merged in PR #185 (`5065324`): merge/deduplicate application crons and gate maintenance dispatch. Preview Workers intentionally remain cron-free; preserve that newer deployment policy. |
| P4 | Substantially implemented in alpha 91–94: canonical Stripe lookup, generation fencing, immutable subscription ownership, and atomic projection/entitlements/outbox/receipt. Remaining work is durable queued reconciliation and local-adapter parity, plus verification against the acceptance matrix. Extend existing mechanisms rather than replacing them. |
| P5 | Still needed. Current outbox provenance pruning is an explicit operator command, not automatic cleanup. Protect manual pruning as well as any future retention job. |

The framework now carries its own [platform hardening specification](https://github.com/gregmushen/trestlejs/blob/3a0f542e64001a054ac231b13fae6fbfd6df2b01/docs/PLATFORM_HARDENING_SPEC.md). Its P1/P3 status table has not yet caught up with the merged code. Use source and regression evidence to determine completion.

**Next sequence:** adopt and verify P1/P3; implement P2/P5 together; finish the remaining P4 work. Rebase the garden architecture/capability map before scaffolding because main also gained admin, regional settings, and substantial deployment/upgrade machinery.

**Evidence boundary:** inspected the changed generator, cron renderer, billing reconciliation implementation, and framework hardening spec in an isolated archive. Executed the dependency-free cron configuration tests. Did not rerun upgrade rehearsals, database tests, full canary checks, or live-provider tests; this review does not independently certify the other task's test results.

## 1. Objective and scope

Make the existing Trestle foundation safe to use for related tenant records, private background work, composed cron triggers, and billing updates delivered out of order. Preserve trusted event provenance for the full supported retry and replay lifetime.

These are focused improvements to existing mechanisms. They do not require a new scheduling platform, notification framework, admin product, or gardening subsystem. The principal implementation work is five independently reviewable changes; trusted execution and provenance retention have a shared security contract and must be validated together.

This specification targets framework tooling and generated templates on main, not the currently checked-out feature branch. Implementation must recheck main for intervening fixes before editing. The cron overwrite was reproduced by a pure-function experiment. Relationship integrity, background authority, retention, and billing findings are source-backed concerns; their regression scenarios must be demonstrated during implementation. No database or deployed-provider tests were run for this specification.

## 2. Delivery map

| Change | Finding from 04 | Deliverable | Dependency |
|---|---|---|---|
| P1 | G1 | Tenant-safe generated foreign keys | Before relying on generated tenant relationships |
| P2 | G2 | Reusable committed-event verification and restricted background context | Before private background handlers |
| P3 | G3 | Preserve custom crons while adding framework maintenance tick | Before deploying independent application crons |
| P4 | G4 | Reconcile billing without allowing stale writes | Before paid launch |
| P5 | G11 | Explicit provenance retention and replay boundary | Before provenance cleanup; required contract for P2 |

Ship template/tool changes with tests and an adoption guide. Existing generated applications own their source: updating a package does not automatically patch copied files or migrate their database.

## 3. P1 — Tenant-safe generated relationships

### Problem

The resource generator currently references a parent by ID alone. A child's tenant policy does not establish that its parent belongs to the same tenant. This is a referential-integrity concern, not a claim that a cross-tenant read exploit has been demonstrated.

### Required behavior

1. Every generated relation between tenant resources enforces equality of tenant identity at the database boundary.
2. Use a composite foreign key from `(organization_id, parent_id)` to the parent's `(organization_id, id)`, backed by an appropriate unique constraint. Actual identifiers follow existing generator naming conventions.
3. Keep the existing ID primary key and public API shape. Do not ask clients to submit an additional tenant value; the execution context supplies it.
4. Optional parent references may remain null. Tenant identity remains non-null. Required relations, if supported later, must satisfy the same invariant.
5. Reject unsupported relation targets before writing generated files. Do not silently emit a weaker ID-only relationship for a shared or unknown target.
6. Preserve established delete behavior. In particular, do not apply a composite `SET NULL` action that would also null the tenant column. Any changed delete behavior must be explicit and tested.
7. RLS remains forced and runtime-role grants remain restricted. Composite constraints supplement RLS.

### Generator and migration work

Update relation generation, schema declarations, migration generation and add-field handling. Deduplicate parent unique constraints when multiple relations use the same parent. Constraint names must be stable and valid for PostgreSQL identifier limits. Keep generator metadata and migration snapshots consistent.

For existing projects, provide a preflight query that detects cross-tenant links and missing parents using a migration-authorized connection. Do not repair, reassign, delete, or expose customer records automatically. Abort migration with counts and actionable operator guidance if invalid relationships exist. Add and validate replacement constraints before dropping the original reference. Document locking implications and a staged validation option for populated tables.

### Acceptance criteria

Use real PostgreSQL with the restricted runtime role, not only generated-text snapshots:

- Same-tenant parent/child creation and updates succeed.
- An attempted cross-tenant link fails on insert and update, including when the parent ID is known.
- Null optional references succeed; missing parents fail; tenant switching cannot preserve an invalid relationship.
- Parent deletion follows the declared policy and cannot null tenant identity.
- Migration succeeds with valid existing data and fails safely with invalid existing data.
- Generation and add-field both produce equivalent protection; repeated references do not create conflicting constraints.
- Existing tenant-isolation checks still pass.

Primary source: 04 [S3, S4].

## 4. P2 — Trusted background execution

### Problem

The queue runtime validates envelopes and manages inbox retries, but does not establish tenant authority for handlers. A committed-event check exists inside local outbound webhook projection; it is not a general guard and is bypassed when that feature is disabled.

### Required boundary

Treat a queue or Workflow message as a reference to work, never as authority. Before a private handler executes:

1. Validate the event against its registered schema.
2. Reload the committed event and trusted tenant provenance by event ID from framework-controlled storage.
3. Verify the supplied envelope against the committed record. Cover every execution-relevant field: event identity/type/version, resource identity, payload, idempotency and correlation data, and any other metadata consumed by the handler. Use a defined canonical comparison; object-key order must not cause false mismatches.
4. Use the committed record as the handler's event input and sole source of tenant identity.
5. Resolve the registered handler's explicit authority, scoped database, services, logger and injected clock.
6. Load current authorization/entitlement state where the handler requires it. A prior event does not grant perpetual permission.

Extract the verification primitive from webhook-specific composition and reuse it for private Queue and Workflow paths. It must operate when outbound webhooks are disabled. Preserve webhook behavior through the common primitive.

### Context and registration contract

Exact exported names may follow current conventions; these semantics are required:

- Private handlers explicitly declare tenant/system execution and the narrow capabilities needed. Missing declarations fail closed.
- A system principal identifies the operation; it is not an administrator, user impersonation, or RLS bypass.
- Tenant repositories use the existing scoped database and transaction-local tenant setting.
- Shared operational handlers are explicitly registered separately. Missing tenant provenance must never silently promote a handler to global access.
- Application composition owns operation-specific permissions, user-delegation requirements, and entitlement policies. The framework supplies the verified context seam.
- Pure parsing or logging handlers may remain unscoped, but receive no private-data capability by default.
- Existing handlers need an explicit compatibility/adoption path; do not silently grant new authority to legacy registrations.

An event's authenticity does not prove its handler is authorized to perform every mutation. If an operation acts on behalf of a user, the application must define and recheck the relevant user authority; other operations may legitimately run as a restricted system principal.

### Failure and retry semantics

Unknown, mismatched, or expired provenance must not invoke the private handler. Record a structured failure category and event ID, without dumping sensitive payloads. Transient storage/provider failures use bounded retries; permanent invalid messages use the existing dead-letter/quarantine mechanism without being marked as successfully handled. Missing records require a bounded, documented policy: never invent authority to recover them.

Preserve existing inbox duplicate handling. Inbox completion follows successful handler completion, not just context creation. Database writes and emitted events remain transactional; external effects still require application idempotency. Do not claim exactly-once delivery.

### Acceptance criteria

- Valid committed events reach the handler with the committed tenant and scoped data access.
- Forged payload, resource, tenant metadata, type or version cannot reach private code.
- Missing provenance fails closed; no tenant fallback or privileged database is used.
- Queue and Workflow execution enforce the same boundary, including with webhooks disabled.
- Duplicates, handler failures, retries and database outages preserve inbox correctness.
- Concurrent handlers for different tenants cannot share tenant context.
- Current permission/entitlement changes are visible when required by registration policy.
- Injected clock and logger are available; fixed-clock tests are deterministic.

Primary source: 04 [S5, S7, S9]. P5 defines how long this boundary can authenticate delayed work.

## 5. P3 — Preserve application cron configuration

### Problem

`renderQueueConfig` replaces the target environment's cron list with `[* * * * *]` when queues or R2 are enabled, discarding application triggers.

### Required behavior

- Preserve target-environment cron expressions in their existing order.
- Append the framework minute expression only when queues or R2 require it and it is not already present.
- Deduplicate identical expressions without reordering unrelated expressions.
- Preserve other trigger properties and all unrelated environment configuration.
- When neither capability requires maintenance, do not add the framework tick or remove user declarations.
- Repeated rendering is idempotent; do not mutate the input configuration object.
- Validate malformed trigger lists and report a clear configuration error rather than replacing them.

Do not broaden this fix into a scheduler. Document how the application's scheduled handler routes by trigger and how the framework minute tick invokes maintenance. Ensure custom trigger invocations do not unexpectedly multiply maintenance work: maintenance is gated to its intended tick or is explicitly protected by existing due-work/lease logic. Respect environment-specific configuration; do not invent inheritance for cron declarations.

### Acceptance criteria

Test absent and empty lists, an hourly application cron, an already-present minute cron, duplicates, unrelated trigger properties, queues-only, R2-only, both, neither, and repeated rendering. Verify other environments remain unchanged. Exercise scheduled dispatch with both a custom and framework trigger.

Primary source: 04 [S8].

## 6. P4 — Order-safe billing reconciliation

### Problem

Normalized billing events have occurrence timestamps, but inspected projection writes replace the stored subscription and entitlements without an observed ordering guard. Deduplicating event IDs does not prevent an older distinct event arriving later from overwriting newer state.

### Selected approach

Use verified provider events as reconciliation signals. Resolve the subscription's current canonical provider state through the payment adapter, then project subscription and entitlements together. Do not use event arrival order, event-ID lexical order, or occurrence timestamps alone as a total ordering guarantee.

First reproduce the failure with a deterministic adapter fixture. If newer main already handles it, verify that implementation against the acceptance criteria rather than adding a competing mechanism.

### Required behavior

1. Verify webhook authenticity and durably deduplicate provider receipts using existing ingress mechanisms.
2. Resolve the affected tenant from a trusted provider-customer/subscription mapping. Never authorize a tenant solely from arbitrary incoming metadata.
3. Durably request reconciliation. A successful webhook response means the receipt and required work are committed, not that a provider fetch happened to succeed.
4. Serialize reconciliation for the projection key, or use an equivalent fenced lease/generation mechanism. Canonical fetch alone is insufficient: an older in-flight fetch must not overwrite a newer applied result.
5. Fetch after acquiring the right to reconcile. Avoid holding an open database transaction across a provider network request. Lease expiry must fence stale writers.
6. Atomically replace subscription state and its derived entitlements. Preserve manual overrides and existing entitlement-resolution semantics.
7. Events received during reconciliation must leave work due for another pass; completion must not erase a newer request.
8. Provider errors retain the last confirmed projection and retry. Do not grant or remove access based on an unverified fallback event snapshot.
9. Handle canceled/deleted subscriptions and authoritative not-found responses explicitly. A transient error is not cancellation. Define fixtures for the adapter's terminal-state contract.
10. Respect the current one-projection-per-organization model. An event for an old subscription must not replace the organization's current subscription; reconcile the trusted current association or apply an explicit lifecycle transition.

Reuse existing queues/outbox/inbox where appropriate. A compact durable reconciliation record keyed by the existing projection identity is sufficient; this does not require a general job registry. Log receipt, reconciliation attempt, outcome and projection generation for diagnosis without payment payloads or secrets.

The local payment adapter must support deterministic equivalent reconciliation behavior. Grace periods, Free/Pro features, and commercial policy remain application-owned.

### Acceptance criteria

- Deliver distinct older/newer events in both orders; final state matches canonical provider state.
- Duplicate delivery does not duplicate side effects.
- Equal timestamps do not cause arbitrary winner selection.
- A slow older reconciliation cannot overwrite a newer result, including after lease expiry.
- A new receipt during reconciliation causes another pass.
- Provider failure, process crash and retry converge without losing durable work.
- Subscription and derived entitlements cannot be partially updated.
- Cancellation, replacement subscription, and delayed events for the old subscription behave correctly.
- Unknown mappings cannot mutate another tenant.
- Manual overrides remain effective according to existing policy.

Run deterministic adapter and PostgreSQL concurrency tests. Use an opt-in provider sandbox smoke test for actual adapter behavior before paid launch; fixtures alone do not verify live provider integration.

Primary source: 04 [S11], plus webhook composition in [S8].

## 7. P5 — Provenance lifetime and replay

### Problem

A published outbox record can be marked succeeded before downstream processing finishes. Pruning it solely on publication success can remove the authority P2 needs for a delayed message or Workflow.

### Initial implementation decision

Keep committed provenance for trusted background events until the supported delivery/retry/replay window has safely expired. Default to no automatic deletion of that provenance unless a retention policy is explicitly configured and validated. Existing delivery-state cleanup must not incidentally delete authority still needed by downstream execution.

This is an intentional initial storage tradeoff. A separate compact immutable provenance store is a future optimization if keeping full outbox records becomes costly; do not introduce a second store without a measured need.

### Required contract

- Document the maximum supported queue delay, retries, dead-letter replay age, Workflow duration, and operational safety margin. Choose retention from those actual supported limits; this spec does not invent a universal number of days.
- Pending or active durable work must retain its provenance even if the nominal age threshold is reached. If the runtime cannot reliably determine completion or safe expiry, retain the record.
- Validate the cleanup configuration against the declared support window before deletion is enabled. Failing validation disables deletion and produces an actionable error.
- Unsupported late replay fails closed with a distinct expired/missing-provenance outcome. Do not reconstruct trusted authority from the queue payload.
- An operator can request fresh authorized work through normal domain commands; that produces new provenance rather than bypassing expiry checks.
- Retention jobs are bounded and concurrency-safe. A pending reference cannot race cleanup into deleting required provenance.
- Preserve the distinction between publishing success, consumer completion and overall replay eligibility in code and documentation.
- Emit cleanup counts and oldest retained age so operators can observe storage growth and blocked cleanup.

### Acceptance criteria

Publish an event, mark outbox delivery succeeded, delay consumption, run cleanup, then execute the handler successfully inside the supported window. Also cover retry, pending Workflow, dead-letter replay, boundary times with an injected clock, concurrent cleanup, and explicit expiry outside the support window. Prove invalid retention configuration cannot delete required records.

Primary source: 04 [S7, S9].

## 8. Deferred improvements and application ownership

| Finding | Decision |
|---|---|
| G5 generic scheduling registry | Defer; applications compose due-work handlers using existing scheduled entry and leases |
| G6 shared resources/editor authority | Application schemas and explicit policy now; no global relaxation of tenant defaults |
| G7 JSON/decimal/geometry fields | Application schemas now; generic field additions can be separate proposals |
| G8 optimistic concurrency | Application compare-and-swap and versioning now; optional generator capability later |
| G9 notification ledger/preferences | Application-owned; reuse existing email adapters and receipts |
| G10 independent scaffold name | Use a valid empty staging directory; optional CLI ergonomics later |
| G12 broader clock cleanup | Inject clocks in all changes here; defer unrelated repository-wide refactoring |

Garden geometry, climate providers, research workflows, crop publication, planting rules, weather cadence, alert policy and consumer onboarding remain outside the platform change set.

## 9. Implementation and adoption sequence

1. Recheck main and record the implementation baseline. Work in an isolated checkout; preserve unrelated local changes.
2. Ship P3 as a focused configuration fix.
3. Ship P1 with generator fixtures, real database regression coverage and a migration guide.
4. Define P5's retention contract, then implement P2 and P5 together or as linked changes. Do not advertise private background execution as complete while cleanup can invalidate supported work.
5. Ship P4 with the failure reproduction, durable reconciliation, adapter contract and concurrency tests.
6. Generate a clean canary application from the changed generator. Exercise each new behavior there, not only inside framework unit tests.
7. Document application adoption file-by-file: copied template changes, configuration defaults, schema migrations, event-handler registration updates and operational settings.

For existing installations, pause unsafe provenance cleanup before deploying trusted consumers. Apply additive migrations before code requiring them. Preflight relationship data before constraints. Do not roll back to stale billing writes or restore permissive background authority as an operational recovery strategy; use a forward fix or pause the affected worker. Migration guides must identify any irreversible data removal—none is intended by this spec.

## 10. Definition of done

Each change includes a focused regression test, compatible or explicitly documented defaults, implementation notes, and an adoption path for generated apps. Run affected package checks and the repository-required checks. The canary must install, typecheck, test and build, and pass the relevant Trestle architecture and doctor checks.

Security/integrity acceptance tests use real PostgreSQL with actual runtime grants. Record executed and skipped suites separately: a green run with missing database configuration is not evidence that database isolation or concurrency passed. Live-provider tests remain explicitly opt-in and are reported separately.

Completion evidence must name the framework commit, generated-canary result, migrations tested, runtime-role test result, and any remaining deployment-only verification. Do not claim deployment or production readiness from source inspection alone.

## 11. Source pointers

All paths below are relative to the pinned Trestle repository. The [04 source index](04-trestle-capability-map-and-project-structure.md#source-index) contains commit-pinned links.

- P1: `packages/cli/src/generate-resource.ts`, generator tests, template `packages/db/src/tenancy.ts` and runtime roles.
- P2: template `apps/worker/src/async-runtime.ts`, `webhook-runtime.ts`, `execution-context.ts`, `packages/context/src/index.ts`, and associated async/provenance tests.
- P3: template `scripts/queue-config.mjs`, `queue-config.test.mjs`, and `apps/worker/src/index.ts`.
- P4: template `packages/billing/src/repository.ts`, `packages/integrations/src/payments/events.ts`, payment adapters/contracts, and Worker billing-webhook composition.
- P5: template `packages/db/src/outbox.ts`, event contracts, cleanup composition, and async/Workflow runtime.
