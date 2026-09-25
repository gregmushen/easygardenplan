# Easy Garden Plan — Master Implementation Plan

Status: canonical build guide for the first public release. Update this file as work lands. The detailed specifications remain authoritative for behavior and edge cases.

Last reviewed: September 25, 2026. Trestle baseline: remote `main` at `c00ca6ab9795fb0bf96e67ffe797125a6220c484` (`0.1.0-beta.1`).

## 1. How to use this plan

This is the entry point for implementation. Work through the phases in dependency order, checking off deliverables only when the phase exit gate has evidence. A phase may overlap another where the dependency table permits it, but no downstream feature is considered complete until its dependencies pass.

The supporting specifications answer the detailed questions:

| Reference | Authority |
|---|---|
| [01 — High-level plan](01-highlevel-plan.md) | Product promise and Free/Pro boundary |
| [02 — Feasibility](02-feasibility.md) | Provider selection, cost assumptions and feasibility risks |
| [03 — Architecture and flows](03-system-architecture-and-flows.md) | System boundaries, ownership and end-to-end flows |
| [04 — Trestle capability map](04-trestle-capability-map-and-project-structure.md) | Framework/application split and package shape |
| [05 — Trestle platform changes](05-trestle-platform-change-spec.md) | Platform correctness requirements and history |
| [06 — Application implementation](06-application-implementation-spec.md) | Application contracts and broad acceptance gates |
| [07 — Data and planting rules](07-data-and-planting-rule-model.md) | Crop knowledge, evidence, regional matching and date semantics |
| [08 — Garden editor](08-garden-editor-and-planning-behavior.md) | Geometry, placement, editing, activation and print behavior |
| [09 — Monitoring and notifications](09-monitoring-and-notification-policy.md) | Weather state, transition alerts, delivery and recovery |

When this plan and a detailed specification disagree, stop and reconcile the documents before coding the disputed behavior. Record product changes in the relevant detailed spec and update the affected phase here. Do not let implementation become the only record of a changed decision.

## 2. Release outcome

The release is complete when a gardener anywhere in the United States can:

1. Create an account and automatically receive a private household workspace.
2. Locate a garden, draw and measure valid polygon beds, and record sunlight observations.
3. Choose supported vegetables and herbs with growing methods and quantities.
4. Generate, review and activate a source-backed layout and seasonal calendar.
5. Print a dimensioned staking diagram and record actual planting/progress.
6. Use the Free plan without a paid subscription.
7. Upgrade to Pro for current-weather recommendations and frost-risk transition alerts in-app and by email.
8. See honest uncertainty, stale-data state and provider failures rather than fabricated precision.

“All US regions” means the software and data model handle Alaska, Hawaii, frost-free climates, high elevation, multiple seasons and cross-year windows. Launch coverage must be measured and disclosed. It does not permit unsupported crop/location combinations to receive invented guidance.

## 3. Non-negotiable engineering rules

- Private records use household tenancy, forced PostgreSQL RLS and tenant-safe relationships.
- Shared published knowledge has explicit read/editorial authority and no fictitious tenant.
- Domain code does not import provider SDKs or database implementations.
- Queue and Workflow messages are references, never tenant authority. Private handlers declare tenant authority and use the verified scoped context.
- Plans, published rules, geometry revisions and recommendation versions are immutable historical inputs. Corrections create new versions.
- The seasonal baseline, proposed weather adjustments and actual planting history remain separate.
- Deterministic planning consumes stored published data; it never invokes research or generative AI during a customer request.
- Exact home locations and garden details do not enter research prompts, generic logs or public analytics.
- Every external provider has a deterministic local adapter or recorded normalized fixtures.
- Missing data remains missing. Provider success, email acceptance and delivery are distinct states.

## 4. Platform readiness

Generate the app from the pinned Trestle main revision or a later explicitly reviewed revision. At the current baseline:

- Tenant-safe generated relationships are complete for newly generated resources.
- Application cron preservation is complete.
- Committed-event verification, explicit background authority, 14-day replay enforcement and 30-day provenance retention are complete.
- Billing has canonical-state lookup, generation fencing, immutable provider-subscription ownership and atomic projection. Durable queued reconciliation and local-adapter parity remain platform follow-ups before the paid-launch gate.
- Existing-project relationship migration tooling remains open, but does not apply to a fresh scaffold generated after the fix.

Before scaffolding, verify the latest main and read its generated `AGENTS.md` and setup skill. Use `trestle plan init`, `plan diff`, and reviewed `apply`; the old setup console no longer exists. Commands labeled experimental require explicit opt-in.

One platform detail needs an explicit implementation check: the merged replay verifier describes its age as measured from the committed event's `occurredAt`. Our intended contract is age from durable commit time. Confirm that newly emitted application events set `occurredAt` from the transaction clock at commit, or move the verifier to an immutable stored commit timestamp before relying on delayed work. Record the outcome in this plan.

## 5. Phase map

| Phase | Result | Depends on | Can overlap |
|---|---|---|---|
| 0 | Reproducible scaffold and environments | Platform baseline | None |
| 1 | Accounts, household and private garden shell | 0 | 2 research schema design |
| 2 | Shared crop knowledge and editorial pipeline | 0 | 1, 3 provider fixtures |
| 3 | Location, climate association and provider adapters | 1 | 2, 4 UI prototype |
| 4 | Bed editor and dimensioned geometry | 1 | 2, 3 |
| 5 | Deterministic planner, review and activation | 2, 3, 4 | Catalog expansion |
| 6 | This Week, tasks and actual progress | 5 | Print refinement |
| 7 | Weather ingestion and recommendation state | 3, 5, 6, platform background gate | Billing completion |
| 8 | Notification feed and email delivery | 7 | 9 billing work |
| 9 | Free/Pro billing and account experience | 1, platform billing gate | 7, 8 local mode |
| 10 | Public site, operations and privacy completion | 1–9 as relevant | Ongoing |
| 11 | Nationwide validation and launch | 0–10 | None |

## 6. Phase 0 — Scaffold and reproducible foundation

### Work

- [x] Record the exact Trestle source commit and package provenance.
- [x] Generate into a new empty directory named `easygardenplan`; do not generate over the populated planning directory.
- [x] Reconcile generated source into the intended repository while preserving `docs/planning` and `.gitignore`.
- [x] Initialize Git and establish the default branch and required CI checks.
- [x] Run the setup plan flow and review every proposed change before applying it.
- [x] Keep queues enabled. Enable R2 only when the first stored artifact needs it. Enable Workflows only for a demonstrated long-running flow. Keep unused capabilities off.
- [x] Configure local PostgreSQL, captured email, local billing and fixed-clock/provider fixture modes.
- [x] Define encrypted credential names for each environment; do not create a parallel plaintext secret system.
- [x] Add application-level test commands and a test-evidence convention that records skipped suites.
- [x] Run install, typecheck, test, build, architecture check and doctor on the untouched scaffold.

### Completion claim

**Claim:** A developer can reproduce a healthy Easy Garden Plan foundation from a clean clone, and the enabled Trestle capabilities work locally before product code is added.

Implementation note: at the pinned baseline, `trestle plan init` rejects the starter it constructs because the project manifest contains optional secrets with empty `required` lists and an admin-target secret while the SetupPlan schema accepts neither. Until the framework fixes that mismatch, maintain the equivalent schema-valid `.trestle/setup.json` in source and continue to use `trestle plan validate`, `plan diff`, and `apply --yes`. This is a recorded CLI deviation, not an alternate setup system.

### Required proof

- A committed bootstrap document containing the pinned Trestle commit and exact setup/check commands.
- A clean-clone CI run showing install, typecheck, test, build, architecture check and doctor passing.
- Test output listing pass/fail/skip totals, with every skip explained.
- Local smoke evidence for sign-in, captured email and Free/local-billing state.
- A reviewed setup-plan diff and an inventory of enabled bindings and encrypted credential names.

## 7. Phase 1 — Identity, household and garden shell

### Work

- [x] Replace template product naming, sample navigation and sample entitlement codes.
- [x] Define application permissions for garden reading/editing and editorial publishing, separate from organization roles.
- [x] Implement idempotent default-household creation after account setup and select it automatically.
- [x] Hide organization terminology from the gardener-facing flow while retaining the tenant model.
- [x] Add the private `garden` aggregate with name, confirmed pin, timezone, display units, conditions, monitoring preference and revision.
- [x] Add authenticated garden routes, typed clients and the app shell/onboarding progress state.
- [x] Apply forced RLS, runtime grants and real database isolation tests.
- [x] Add account deletion semantics for garden-owned records and queued work.

### Completion claim

**Claim:** Every authenticated user receives one usable private garden workspace, and tenant boundaries hold at the API and database layers without requiring a subscription.

### Required proof

- Browser test: new account → automatic household → save/reload garden, with no organization UI.
- PostgreSQL concurrency test proving simultaneous first requests create one intended default household.
- Runtime-role integration tests proving same-tenant access succeeds and cross-tenant, guessed-ID and missing-context access fails.
- Route authorization tests for garden read/write permissions.
- A Free-user test with no subscription record showing garden access remains enabled.

## 8. Phase 2 — Crop knowledge and editorial pipeline

### Work

- [x] Implement shared schemas for crop, alias, variety, source, evidence, research run, rule family/version, review decision and catalog release.
- [x] Implement typed rule payloads and declarative applicability predicates from 07, including explicit known/not-applicable/unknown/conflicted states.
- [x] Add restricted editorial routes and screens for draft review, conflict resolution, publication, withdrawal and replacement.
- [x] Add the Exa adapter with deterministic fixtures, request fingerprints, provider-run tracking, resumability and cost accounting.
- [x] Add source-retrieval safeguards and keep customer data out of research requests.
- [x] Publish catalog releases atomically; expose only published data to ordinary users.
- [x] Build the coverage matrix by crop, method, rule type and regional/climate class.
- [x] Research a representative seed catalog that exercises every rule shape before scaling breadth.
- [ ] Expand the reviewed catalog toward launch coverage without treating fixture size as a product cap.

### Completion claim

**Claim:** The application can publish a traceable, immutable crop catalog from reviewed evidence while preventing ordinary users and unresolved research from becoming publication authority.

### Required proof

- One end-to-end editorial fixture: research result → evidence → review → atomic catalog publication → planner-readable version.
- Authorization tests showing gardeners read published records only and cannot read drafts or invoke publication.
- Immutability tests showing publication corrections create a new version and old plan references remain valid.
- Rule-validation fixtures for unit normalization, scope, missing data and unresolved conflicts.
- A generated coverage report with crop/method/rule/region cells and explicit supported, partial, missing and conflicted counts.
- One controlled Exa run recorded separately from deterministic local tests before live research is claimed.

## 9. Phase 3 — Location, maps and climate context

### Work

- [x] Implement server-side Geoapify forward geocoding, candidate normalization, rate controls and manual-pin fallback.
- [x] Add MapLibre with an origin-restricted MapTiler key and correct attribution; support map and aerial layers.
- [x] Confirm timezone from location and allow correction.
- [x] Implement versioned USDA/OSU hardiness and NOAA climate/frost imports with staging, validation and atomic publication.
- [x] Persist garden climate associations with source version, match rationale, distance/elevation context and uncertainty.
- [x] Support user-supplied seasonal anchors with private provenance where data is unavailable or weak.
- [x] Add provider health, usage and freshness instrumentation without logging exact private locations.

### Completion claim

**Claim:** A gardener anywhere in the launch geography can establish a usable location and climate context, or receive an explicit recoverable uncertainty state when a provider cannot supply one.

### Required proof

- A versioned representative-location matrix covering the continental US, Alaska, Hawaii, frost-free, high-elevation and weak-match cases.
- Adapter fixture tests for multiple geocoder candidates, no result, timeout/rate failure and manual pin fallback.
- Climate import evidence: source release/checksum, validation totals, rejected records and atomic publish result.
- Assertions distinguishing known, frost-free/not-applicable, unknown and uncertain climate states.
- Browser evidence that tile/geocoder failure does not lose a confirmed pin or prevent continued setup.
- Controlled live checks for Geoapify, MapTiler attribution/imagery and representative climate associations.

## 10. Phase 4 — Bed editor and geometry

### Work

- [x] Select and implement the local metric projection/transform, with numerical and longitude-wrap fixtures.
- [x] Implement immutable bed geometry revisions, outer polygons, exclusions, orientation, provenance and optimistic concurrency.
- [x] Prototype Terra Draw on desktop and touch; adopt it only if the required interactions and accessibility alternatives hold.
- [x] Implement draw, close, move, add/delete vertex, exclusion, undo/redo, pan/edit modes and keyboard/field alternatives.
- [x] Validate self-intersections, degenerate edges, ring containment/overlap and supported request limits in browser and server.
- [x] Implement measured-edge calibration, translation and rotation with preview and explicit application.
- [x] Add manual sunlight observations and clear unknown state.
- [x] Generate an app-owned printable dimensioned bed diagram without provider imagery.

### Completion claim

**Claim:** The bed editor preserves valid measured geometry across map, diagram, storage and print representations, on pointer, touch and keyboard paths, without overwriting concurrent work.

### Required proof

- Property/fixture tests for coordinate round trips, containment, exclusions, intersections, orientation, calibration and numerical tolerances.
- PostgreSQL test proving expected-revision conflicts preserve the newer saved revision.
- Browser recordings or screenshots for rectangle, concave polygon, exclusion, measured correction and invalid-edge recovery on desktop and touch.
- Keyboard-only and screen-reader-label interaction checks for the primary edit path.
- Alaska longitude-wrap fixture and declared supported-extent boundary tests.
- Printed output inspection showing dimensions, origin, orientation and no provider imagery.
- One real measured-bed trial comparing tape measurements with the saved/printed diagram within the declared tolerance.

## 11. Phase 5 — Crop selection and deterministic planning

### Work

- [x] Add crop/variety/method selection, retained-plant quantity, soft/hard bed preferences and pinned positions.
- [x] Freeze `PlanInputSnapshot` with garden, geometry, selections, climate, catalog and algorithm versions.
- [x] Implement rule resolution with selection traces, explicit conflicts and reviewed override relationships.
- [x] Implement local-date window evaluation for multiple seasons, cross-year windows, leap days and missing anchors.
- [x] Implement deterministic placement footprints, obstacles, exclusions, stable ordering and bounded search from 08.
- [x] Return requested/placed/unplaced counts and distinguish proven constraints from heuristic-search limits.
- [x] Persist immutable proposals, explanations and partial-result state.
- [x] Implement manual placement adjustment/pinning using the same validation rules.
- [x] Activate a proposal atomically against current revisions and create future tasks.
- [x] Detect stale asynchronous results; never auto-activate them.

### Completion claim

**Claim:** Given a frozen set of garden, catalog and climate inputs, the planner reproducibly accounts for every requested crop and activates only a plan derived from current reviewed inputs.

### Required proof

- Golden fixtures showing byte-normalized equivalent results for repeated runs with the same snapshot and algorithm version.
- Geometry invariant tests proving every accepted footprint stays inside usable ground and clears exclusions/obstacles.
- Rule/date fixtures for multiple seasons, cross-year windows, leap day, missing anchors and explicit conflicts.
- Results showing requested = placed + unplaced for every selection, with stable reason codes.
- Tests distinguishing proven incompatibility from bounded-search exhaustion.
- PostgreSQL concurrency tests for stale generation, stale input revisions and competing activation requests.
- Browser test from crop selection through review, manual adjustment and activation, including a partial plan.

## 12. Phase 6 — Calendar, This Week and actual progress

### Work

- [x] Implement task windows and dependencies using garden-local calendar dates.
- [x] Build calendar and This Week views with instructions and rule/evidence explanations.
- [x] Implement planted/completed/postponed/skipped transitions with expected revisions and actual dates.
- [x] Model sowing, emergence, transplant, harvest, removal and correction as distinct progress events.
- [x] Recalculate estimates from the matching actual-event anchor while preserving ranges and uncertainty.
- [x] Preserve actual planting positions/history across replanning and geometry changes; surface reconciliation conflicts.
- [x] Finish the staking print view with origin, orientation, dimensions, crop legend and unresolved-item notes.

### Completion claim

**Claim:** A Free user can execute a plan and record reality over time while the application preserves the original plan and every actual gardening event.

### Required proof

- Browser test: active plan → This Week → planted/completed/postponed/skipped → updated future estimate.
- State-transition tests rejecting invalid or stale task/planting commands.
- Historical assertions showing baseline plan, accepted replacement and actual events remain separately queryable.
- Maturity fixtures proving the correct sow/emergence/transplant anchor is used and unknown anchors remain labeled.
- Replanning tests showing completed work and actual plantings are neither moved nor deleted.
- Offline/provider-failure browser check showing calendar and staking print view still render from persisted state.

## 13. Phase 7 — Weather monitoring and recommendation state

### Work

- [x] Adopt and verify the framework's tenant-authority handler API and provenance lifecycle in the generated application.
- [x] Implement NWS forecast and official-alert adapters with normalized fixtures, source/retrieval freshness and coverage metadata.
- [x] Implement the narrow due-location index, leases, cursors and shared forecast cache.
- [x] Register private evaluation handlers with tenant authority and the Pro entitlement requirement.
- [x] Evaluate active plantings/future tasks only against published stage-specific rules and usable forecast intervals.
- [x] Persist risk state per garden, hazard and affected crop/stage group: unknown, clear, active and resolved.
- [x] Serialize episode transitions; emit warning, material-change, resolution and renewed-risk events exactly as defined in 09.
- [x] Implement hysteresis/confirmation policy from reviewed hazard rules to prevent threshold flapping.
- [x] Treat stale/unavailable data as unknown, never resolved.
- [x] Implement fresh authorized recovery rather than replaying expired advice.

### Completion claim

**Claim:** Monitoring converts fresh supported weather data into one truthful persisted risk transition per garden/crop context and never clears, repeats or executes advice without current authority and inputs.

### Required proof

- Fixed-clock transition table covering unknown/clear/active/resolved, repeated active/clear, renewed risk, partial group resolution and threshold oscillation.
- PostgreSQL concurrency test showing overlapping evaluations commit one state revision and one semantic transition event.
- Freshness fixtures for stale source, fresh retrieval of old source, missing intervals, provider failure and official cancellation.
- Authorization tests proving tenant provenance and current Pro entitlement are rechecked for start, retry and Workflow resume.
- Event-age tests at, before and after the framework boundary, plus fresh authorized recovery.
- Garden deletion, relocation, planting completion and downgrade tests proving obsolete evaluation is suppressed.
- Controlled NWS staging retrieval whose normalized snapshot and evaluation trace are retained as evidence.

## 14. Phase 8 — In-app feed and email delivery

### Work

- [x] Implement notification preferences for urgent protection, routine guidance and digests, including timezone-aware quiet hours.
- [x] Commit recommendation versions, feed entries and outbox events atomically.
- [x] Create one delivery intent per transition, recipient and channel under a unique constraint.
- [x] Coalesce affected crops for the same garden/action episode and exclude immediately emailed versions from digests.
- [x] Claim delivery intents with bounded leases/fencing and use stable provider idempotency keys.
- [x] Recheck entitlement, preferences, current risk/recommendation state and affected planting immediately before send.
- [x] Define task identities for task-specific recommendations and recheck their status immediately before send.
- [x] Project verified Resend receipts without regressing delivery state on out-of-order receipts.
- [x] Expose accepted, delivered, bounced, suppressed, failed and unknown outcomes operationally.
- [x] Send a resolution email only to a recipient whose warning was accepted/delivered according to the defined ambiguity policy.

### Completion claim

**Claim:** Each eligible recipient receives at most one logical email for each meaningful risk transition, while the in-app record and delivery status remain correct across retries, races and provider uncertainty.

### Required proof

- Database uniqueness and concurrent-claim tests for transition/recipient/channel delivery identities.
- End-to-end sequence: warning sent once → repeated risk silent → resolution sent once → repeated clear silent → renewed warning sent once.
- Tests for queue duplicates, lease expiry, late fenced workers, provider timeouts and stable idempotency reuse.
- Digest test proving immediately emailed recommendation versions are excluded.
- Pre-send suppression tests for unsubscribe, quiet hours, downgrade, supersession, task completion and garden deletion.
- Verified receipt fixtures for accepted, delivered, bounce, duplicate and out-of-order events without state regression.
- Controlled staging delivery to allowlisted recipients, with provider acceptance and receipt state recorded separately.

## 15. Phase 9 — Free/Pro billing and account experience

### Work

- [x] Define Free and Pro plan/entitlement codes and replace sample billing products.
- [x] Complete or adopt durable queued billing reconciliation and local-adapter parity before paid launch.
- [ ] Configure Stripe test products/prices and environment-specific webhook endpoints through Trestle's supported flow.
- [x] Build pricing, checkout, payment-processing return, subscription status and manage/cancel experiences.
- [x] Enforce entitlements independently from garden permissions at HTTP and background boundaries.
- [x] Define downgrade/grace behavior: stop new paid monitoring/delivery at the effective point while preserving Free data/history.
- [x] Add duplicate, delayed, out-of-order, replacement-subscription, provider-outage and recovery tests.

### Completion claim

**Claim:** Free and Pro access always reflects the latest verified subscription state, and payment timing or delivery order cannot grant stale access or destroy Free product data.

### Required proof

- Local deterministic reconciliation tests with behavioral parity to the Stripe adapter.
- PostgreSQL tests for duplicate, out-of-order, concurrent and slow-stale reconciliation, including replacement subscriptions.
- Crash/provider-outage tests proving the durable reconciliation request remains recoverable.
- Browser test: pricing → Stripe test checkout → processing → verified Pro → manage/cancel → effective downgrade.
- Entitlement tests across HTTP and background handlers, including a change between queueing and execution.
- Assertions that downgrade preserves garden, plan, progress and recommendation history.
- Controlled Stripe test-mode webhook evidence and a recorded reconciliation result before paid launch.

## 16. Phase 10 — Public product, operations and privacy

### Work

- [x] Build the public site: value proposition, how it works, Free/Pro comparison, pricing and sourced general guidance.
- [x] Provide a representative sample plan without exposing private data or requiring sign-in.
- [x] Complete account, preferences, attribution, privacy, terms/support and deletion flows.
- [x] Add product-specific doctor/readiness checks for Geoapify, MapTiler, Exa, climate datasets, NWS, Stripe and Resend.
- [x] Add dashboards/queries for crop coverage, forecast freshness, overdue eligible gardens, evaluation backlog, delivery outcomes, billing lag and provider usage.
- [ ] Enter reviewed provider unit costs and budget thresholds after launch credentials and contracted rates are known. The validated rate-card, usage meters and alert states are implemented.
- [x] Add bounded operational replay/recovery actions that honor current authority, event age and recommendation validity.
- [x] Review logs, analytics and error reporting for exact coordinates, addresses, email content and provider secrets.
- [x] Verify MapTiler attribution and ensure printed exports do not include provider imagery without established rights.

### Completion claim

**Claim:** The public product accurately describes the shipped application, and operators can detect, diagnose and safely recover its supported privacy, provider and background-work failures.

### Required proof

- Content review mapping each marketing/price claim to a shipped acceptance case.
- Provider readiness/doctor output for every production integration, with missing configuration failing clearly.
- Operational drill for stale weather, failed delivery, delayed billing and expired work, showing distinct diagnosis and safe recovery.
- Account/garden deletion test proving future jobs and sends stop and private records follow the retention contract.
- Automated secret/PII log fixtures plus a manual review of analytics, error reporting and research payloads.
- Attribution and export-rights review for maps, geocoding, climate sources and printed output.
- Backup/restore evidence for the application's durable state before launch.

## 17. Phase 11 — Nationwide validation and launch

### Required end-to-end path

Locate a real test garden → draw and measure a concave bed → choose crops → generate and activate a sourced plan → print the diagram → record planting → replay a cold-risk forecast → produce one warning → deliver one controlled email → replay continuing risk without another email → resolve the risk and send one resolution → accept a supported task change while preserving baseline/history.

### Validation matrix

- [x] Cold continental, cool maritime, hot-summer, arid, high-elevation and frost-free settings.
- [x] Alaska and Hawaii; longitude wrapping, timezone and provider-coverage behavior.
- [x] Multiple planting seasons, cross-year windows, leap day and daylight-saving transitions.
- [x] Concave/excluded geometry, measured correction, stale edits, pinned placements and partial fit.
- [x] Missing/conflicted crop guidance and weak/unavailable climate association.
- [x] Stale forecast, fresh retrieval of old data, missing forecast intervals and canceled official alerts.
- [x] Duplicate/concurrent jobs, expired provenance, provider outages and ambiguous email outcomes.
- [x] Duplicate/out-of-order billing and entitlement changes during queued work.
- [ ] Keyboard/touch/accessibility flows and supported browser/device matrix.
- [ ] Provider usage and cost under representative load.

### Environment progression

1. Local: deterministic fixtures, fixed clocks, captured email and local billing.
2. Preview: product/browser review with isolated resources; no assumption that account cron capacity is available.
3. Staging: real PostgreSQL roles, controlled provider calls, Stripe test mode and allowlisted email recipients.
4. Production: reviewed migrations, dedicated credentials, smoke tests, monitoring and rollback/forward-recovery notes.

### Completion claim

**Claim:** The complete product works across its declared US scope under normal, uncertain and recoverable-failure conditions, and it can be operated safely in production.

### Required proof

- A release evidence bundle linking every prior phase claim to its proof and application/framework commits.
- The required end-to-end path completed in staging with real runtime roles, queues, schedules and controlled providers.
- A completed nationwide validation matrix with failures, gaps and user-visible behavior recorded.
- Full check reports with pass/fail/skip totals; database suites use actual runtime grants and live-provider checks are labeled separately.
- Migration rehearsal from a clean database and the supported prior application revision, with no schema drift.
- Load/capacity and provider-cost evidence for the declared launch assumptions.
- Accessibility, privacy/deletion, backup/restore, observability and incident-recovery sign-offs.
- A written go/no-go review listing accepted residual risks. Production deployment remains a separate explicit action.

## 18. Migration and event order

Introduce schemas in this order to keep dependencies clear:

1. Household application roles and gardens.
2. Shared crop/evidence/rule/catalog records and editorial authority.
3. Climate datasets and garden associations.
4. Beds and immutable geometry revisions.
5. Crop selections, plan versions/items and tasks.
6. Plantings and progress events.
7. Forecast/alert snapshots, due-work indexes, risk state and recommendations.
8. Notification preferences, feed, delivery intents and receipt linkage.
9. Garden product entitlements/configuration and any billing-reconciliation additions.

Define and register semantic events with their owning phase. At minimum expect garden/bed changes, catalog publication, plan requested/ready/activated, progress recorded, monitoring due, forecast updated, recommendation transitioned, delivery requested and subscription changed. Event names and payloads are versioned; payloads carry identifiers and frozen facts needed for processing, never tenant authority.

## 19. Provider/configuration ledger

| Capability | Production choice | Browser/server | Required before |
|---|---|---|---|
| Geocoding | Geoapify | Server | Phase 3 staging |
| Map rendering | MapLibre GL JS | Browser | Phase 3 |
| Tiles/aerial | MapTiler Cloud | Browser restricted key | Phase 3 staging |
| Crop research | Exa | Server/editorial jobs | Catalog expansion |
| Climate baseline | USDA/OSU and NOAA imports | Operational import | Phase 5 |
| Forecast/official alerts | NWS adapter | Server/background | Phase 7 staging |
| Billing | Trestle Stripe adapter | Server/webhooks | Phase 9 staging |
| Email | Trestle Resend adapter | Server/background | Phase 8 staging |

For every provider, record credentials, allowed environments, attribution, cache/storage rights, rate/cost limits, timeout/retry behavior, health signal and fixture provenance. Open-Meteo remains an evaluated alternative, not an automatic failover. The user-authorized Exa reuse assumption remains recorded in 02 until written confirmation changes it.

## 20. Test and evidence strategy

Use the cheapest test that proves the behavior, but use real infrastructure where isolation, transactions or provider contracts matter:

- Pure tests: rule selection, units/date arithmetic, geometry predicates, placement determinism, risk transitions and notification identity.
- PostgreSQL integration: RLS, tenant-safe relations, revision conflicts, activation atomicity, event/outbox writes, episode serialization, delivery claims and billing convergence.
- Browser/product: onboarding, map/editor, plan review, progress, preferences, checkout and accessibility.
- Recorded provider fixtures: geocoding normalization, climate import, NWS normalization, Exa extraction and email/billing lifecycle.
- Controlled live provider: representative geocodes/tiles, research sample, weather retrieval, Stripe test transaction and allowlisted email delivery.
- Deployed system: bindings, runtime/migration roles, queues, schedules, secrets, observability and failure recovery.

Do not count a green suite that skipped its database/provider cases as evidence for those cases. Each phase completion note records commit, migrations, commands, pass/fail/skip totals, live checks and remaining deployment-only verification.

## 21. Status ledger

Update this table as the build progresses. Use `not started`, `in progress`, `blocked`, or `complete`; completion requires the phase exit gate.

| Phase | Status | Evidence / next action |
|---|---|---|
| 0 Scaffold | Complete | Evidence: `docs/build/phase-00-evidence.md` |
| 1 Household/garden | Complete | Evidence: `docs/build/phase-01-evidence.md` |
| 2 Knowledge | In progress | Deterministic pipeline proof: `docs/build/phase-02-progress.md`; live Exa run and reviewed catalog remain |
| 3 Location/climate | External gate | Real USDA/OSU and NOAA import plus deterministic product proof: `docs/build/phase-03-progress.md`; controlled Geoapify/MapTiler and staging import remain |
| 4 Bed editor | External gate | Local implementation and deterministic/editor proof: `docs/build/phase-04-progress.md`; physical mobile, screen-reader, print and real measurement trials remain |
| 5 Planner | In progress | Synthetic end-to-end, reviewed-override and real climate validation proof: `docs/build/phase-05-progress.md`; reviewed crop-rule breadth remains |
| 6 Progress | In progress | Deterministic product proof: `docs/build/phase-06-progress.md`; accessibility/offline review and real catalog validation remain |
| 7 Monitoring | In progress | Deterministic/background, official-alert persistence and reviewed anti-flapping proof: `docs/build/phase-07-progress.md`; launch rules and staging Queue evidence remain |
| 8 Notifications | External gate | Local implementation and deterministic delivery proof: `docs/build/phase-08-progress.md`; controlled staging delivery requires configured Resend credentials and an allowlisted recipient |
| 9 Billing | In progress | Deterministic product proof: `docs/build/phase-09-progress.md`; controlled Stripe evidence remains |
| 10 Public/operations | In progress | Local public/readiness/deletion/aggregate operations proof: `docs/build/phase-10-progress.md`; staging drills, provider cost and restore evidence remain |
| 11 Launch | In progress | Local matrix, clean and supported-upgrade migration rehearsals, and no-go review: `docs/build/phase-11-progress.md`; controlled staging/provider/accessibility/restore gates remain |

## 22. Deliberately deferred scope

Do not add these to the first release without an explicit product decision and updated dependencies: automated shade estimation, watering recommendations, pest/disease diagnosis, SMS, push notifications, live collaborative editing, automatic succession reuse, unreviewed companion-planting optimization, provider imagery in customer printouts, a general job platform, a vector database, or independent microservices.

The architecture leaves room for these later. Their absence must not produce misleading UI or placeholder claims in the first release.

## 23. Final definition of done

The application is done for launch when the release outcome is demonstrably usable, each phase exit gate has evidence, nationwide uncertainty is handled honestly, Free remains useful without payment, Pro monitoring sends correct transition-based advice without duplicate alerts, and operators can diagnose and recover the supported failure modes. The deployed system must use reviewed migrations, current framework authority boundaries and production provider configuration. A release announcement, domain cutover or production deployment requires its own explicit go-live decision.
