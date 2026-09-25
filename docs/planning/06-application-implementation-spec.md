# Easy Garden Plan — Application Implementation Specification

Status: proposed application implementation contract. No application code or provider resources created.  
Inputs: [01 — Product](01-highlevel-plan.md), [02 — Feasibility](02-feasibility.md), [03 — Architecture](03-system-architecture-and-flows.md), [04 — Trestle mapping](04-trestle-capability-map-and-project-structure.md), [05 — Platform changes](05-trestle-platform-change-spec.md).

## 1. Outcome and boundaries

A gardener can locate a garden, draw and measure arbitrary valid polygon beds, choose vegetables and herbs, review a source-backed layout and seasonal calendar, and record actual planting. Pro adds current-weather recommendations and crop-specific frost alerts through the app and email.

Launch covers all US regions, including Alaska and Hawaii. Missing or uncertain local guidance is represented explicitly; the system never manufactures a frost date or substitutes unrelated regional advice. A broad crop catalog remains the goal. Small development fixtures are not a launch crop cap or a geographic restriction.

Build one Trestle application with the existing site, app, Worker and package boundaries. PostgreSQL owns durable state. Layout and schedule calculations are deterministic. Research supplies reviewed knowledge; it does not execute during a customer's plan request.

This document specifies application behavior and build order. The following documents will supply detailed crop-rule schemas, geometry algorithms and monitoring thresholds before their respective stages are implemented. Proposed defaults here may be refined without changing accepted product scope.

## 2. Platform contract and adoption

Generate from a pinned, verified main revision after the tenant-relation fix (#186). Preserve the current project folder and planning documents; scaffold into a valid empty `easygardenplan` staging directory and reconcile files deliberately.

Use the current setup flow: `trestle plan init`, `plan diff`, and reviewed `apply`. The setup console is removed. Framework imports use `trestlejs`; operational commands marked experimental require explicit opt-in. Read the generated instructions at implementation time.

P2/P5 are being implemented by the framework team; their completion is not yet verified here. Adopt their final API before private background handlers ship:

- Private-data handlers explicitly register tenant authority and use the provided scoped database.
- Committed records supply tenant identity; queue fields never grant access.
- Undeclared handlers receive verified events but no database. System handlers receive no automatic global data access.
- Every start, retry or Workflow resume must pass verification within 14 days of the event's persisted commit timestamp. Do not use business `occurredAt` as the commit clock.
- Provenance retention is 30 days. Expired work cannot be revived by resubmitting its payload.
- Recheck current entitlements and recommendation validity before acting. Transient infrastructure failures remain retryable.

Application recovery creates fresh, authorized evaluations of current state. It does not resend expired weather advice. Any long research/import workflow checkpoints progress and starts new authorized work before its event lifetime expires.

P4's queued reconciliation and local-adapter parity remain dependencies for the full paid-launch acceptance contract. Household setup, geometry, catalog development and the Free planning flow can progress independently.

## 3. Ownership and persisted contracts

Every private table carries household/organization identity and forced RLS. Private relations enforce matching tenant identity at the database boundary. Shared catalog tables have explicit read/publication grants; they are not assigned to a fictitious household.

| Aggregate | Required persisted information | Invariants |
|---|---|---|
| Garden | Household, name, confirmed pin, IANA timezone, display units, conditions, revision | Address is optional; timezone is confirmed or corrected; edits use expected revision |
| Bed revision | Bed identity, local metric polygon and exclusions, geographic transform/anchor, orientation, measurement provenance, sunlight observations | Immutable revision; valid geometry; display/map representations derive consistently |
| Crop selection | Garden, crop/optional variety, growing method, desired quantity, optional bed preference | Quantity means plants/positions for the initial planner; never silently reduce it |
| Knowledge version | Crop identity, rule kind, method, regional applicability, values/units, evidence links, publication state | Published versions immutable; incomplete facts stay unknown |
| Climate association | Garden, dataset versions, matched source, rationale, confidence, seasonal context | Distinguish frost-free, unavailable and estimated values |
| Plan version | Frozen inputs, bed/rule/climate versions, algorithm version, placements, unplaced items, task windows, explanations | Proposal is immutable; activation is an explicit command |
| Planting | Crop, bed/position, method, quantity, actual dates and lifecycle events | Planning changes never move or delete actual plantings |
| Task | Plan/planting reference, local date window, status, actual completion date, revision | Completion, skip and postponement are distinct |
| Recommendation | Affected records, reason code, action, validity, supporting forecasts/rules, state | Supersession preserves history; invalid advice cannot be accepted |
| Delivery intent | Recommendation version, recipient/channel, deduplication identity, attempts and provider receipts | One logical delivery may have multiple attempts; acceptance is not delivery |

Use UUID record identities, UTC instants for system events, and garden-local calendar dates for planting windows. Store explicit units; convert at presentation boundaries. Required-field constraints apply when publishing or generating a plan, rather than preventing useful partial setup drafts.

Proposed command result convention: successful commands return persisted revision and resulting state; validation errors identify fields; stale revisions produce a conflict with the current revision. Caller-supplied idempotency keys are scoped to household and operation and cannot be reused with different inputs.

## 4. Application commands and state transitions

Exact route spelling may follow framework conventions; these command boundaries are required.

| Command | Checks | Result |
|---|---|---|
| Ensure household | Authenticated account; concurrency-safe first-run lookup/create | One intended default household, ready for onboarding |
| Save garden | Membership/application permission; expected revision; location/timezone validation | Updated draft and revision |
| Save bed | Same-tenant garden; expected revision; server geometry validation | New geometry revision |
| Save crop selections | Published identities; valid method and positive quantities | Saved selection draft |
| Generate plan | Complete enough location/geometry/rule inputs; freeze snapshot | Proposal, pending generation ID, or explicit unresolved constraints |
| Activate plan | Proposal ownership; expected active revision; inputs still current | Atomic active-version change and future task creation |
| Record progress | Task/planting ownership; expected revision; valid transition/date | Progress event and derived future estimates |
| Accept recommendation | Current entitlement where required; still valid; expected target revision | Recorded acceptance and permitted future-task adjustment |
| Publish knowledge | Explicit editorial authority; evidence and applicability validation | Immutable published version |

Plan states are `pending → ready` or `failed`; activation is a separate garden-to-version reference. Two activation requests cannot create competing active plans. Replacing a plan retires only applicable unfinished future tasks; completed tasks and actual planting history remain intact.

Recommendations may be open, accepted, dismissed, superseded or expired. Email status is independent. An accepted protection recommendation records the user's action without fabricating a planting event.

## 5. User experience contract

Onboarding progresses through location → beds and measurements → conditions → crops → review → activation. Save completed steps and clearly distinguish unsaved edits. Automatically create the household; do not show organization setup terminology.

The map locates beds. A metric diagram controls placement and produces the staking printout. Accept concave shapes and interior exclusions; reject self-intersections with useful visual feedback. Manual measured corrections create a new revision. Imagery failure must not destroy or block a measured bed.

The plan review shows requested versus placed quantities, reasons crops could not be placed, uncertain inputs, planting windows and source explanations. No placement may extend its required spacing footprint into excluded space or outside the bed. User adjustments regenerate a proposal rather than silently changing the active plan.

This Week combines due tasks and relevant recommendations while distinguishing baseline guidance from current-weather advice. Free users retain their calendar, printable diagram and progress history. Subscription expiry stops new paid monitoring and delivery without deleting their garden.

## 6. Build slices and acceptance gates

### A. Scaffold, household and access

Create the pinned scaffold, configure local adapters, and establish application permissions. Add idempotent household onboarding and private garden persistence.

**Done when:** a fresh account saves and reloads a garden; concurrent onboarding does not create duplicate defaults; another household and a no-context connection cannot access it; baseline project checks pass. No paid provider account is needed for this slice.

### B. Bed editor and measured diagram

Implement geographic/local coordinate conversion, valid polygon/exclusion persistence, revision conflicts, manual measurement and printable geometry. Evaluate Terra Draw through actual touch editing before committing to it.

**Done when:** desktop and mobile can create/edit a concave bed, preserve an exclusion, correct dimensions and reload equivalent geometry. Include Alaska longitude-wrap cases. Stale edits cannot overwrite newer work. The printout includes dimensions and labels without provider imagery.

### C. Knowledge and climate pipeline

Implement shared drafts, evidence, review/publication, Exa research adapters and versioned climate imports. Keep unpublished data inaccessible to normal users. Use fixture data first; provider access is required only for live research/import verification.

**Done when:** a research result can be reviewed and published; conflicting or incomplete rules cannot silently become precise schedules; plans can identify the exact rule version used. Validate representative cold, warm, frost-free, high-elevation, Alaska and Hawaii cases, plus cross-year and multiple-season windows.

### D. Free planning and progress

Implement deterministic placement and rule evaluation, immutable proposals, atomic activation, task display and actual planting records. Include growth method and quantities in input snapshots. Export the app-owned staking diagram.

**Done when:** a user completes the whole Free flow, sees unplaced crops explicitly, and records planting. Identical versioned inputs produce identical results. A stale generation cannot replace a newer edit. Replanning preserves actual plantings and completion history. Missing climate/rules produce useful uncertainty rather than fabricated dates.

### E. Pro monitoring and recommendations

Adopt verified P2/P5. Add shared forecast caching, narrowly authorized due-work discovery, tenant evaluation, recommendation history and an in-app feed. Start with the hourly forecast policy from 03; keep cadence configurable and separate from risk/freshness rules.

**Done when:** fixed-clock forecast replay generates the expected crop-specific action; unchanged inputs do not duplicate recommendations; stale/missing weather shows delayed monitoring; changed forecasts supersede advice; entitlement expiry suppresses paid work. Expired event recovery creates fresh evaluation from current state.

### F. Delivery and billing

Connect current billing entitlements, notification preferences, email delivery intents, receipt projection and operational recovery. Preserve existing ordering protections while adopting the remaining P4 changes.

**Done when:** test checkout grants Pro only through verified billing state; duplicate/out-of-order events converge; downgrade preserves Free functionality. A controlled alert appears in-app and sends through the email adapter, with accepted/delivered/bounced/unknown states distinguished. A crash or timeout cannot blindly create an unrelated new send identity. Recheck relevance immediately before delivery.

### G. Launch verification

Run the full product path in staging with actual runtime roles and configured providers. Include accessibility and mobile interaction checks, data deletion, account isolation, nationwide data coverage, provider outages and operational recovery. Confirm deployed bindings, encrypted credentials, map attribution and cost instrumentation.

**Done when:** required checks have evidence, skips are accounted for, known data gaps have honest user behavior, and operational staff can identify delayed weather and failed delivery. No automatic production deployment is implied by this specification.

## 7. Detailed specs required before dependent implementation

| Next document | Decisions to make concrete | Needed by |
|---|---|---|
| 07 — Data and planting-rule model | Crop taxonomy, rule schema, source evidence, regional matching, seasonal windows, units, missing-data semantics | C and D |
| 08 — Garden editor and planning behavior | Measurement authority, polygon limits, spacing/access model, placement priorities, crop adjustments, mobile interactions | B and D |
| 09 — Monitoring and notification policy | Forecast freshness, risk thresholds, alert identities, meaningful changes, quiet hours, delivery/recovery rules | E and F |

These are app decisions, not additional platform requirements. Prices, research budgets and provider credentials remain operational/product inputs; they do not require another architecture redesign. Exa reuse remains the user-authorized assumption recorded in 02.

## 8. Verification and evidence discipline

Unit-test deterministic geometry/rules with meaningful edge cases. Use real PostgreSQL for isolation, composite relations, atomic activation, concurrency and outbox behavior. Use fixed clocks and recorded normalized provider fixtures for weather and lifecycle tests. Exercise the deployed product with controlled recipients and test billing before launch.

Record the pinned framework revision, application revision, schema migrations, checks executed, skipped suites and live-provider evidence. Framework PR success is useful dependency evidence but does not prove this application's custom schema, authorization or product behavior.
