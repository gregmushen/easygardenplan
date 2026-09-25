# Easy Garden Plan — Trestle Capability Map and Project Structure

Date: September 24, 2026  
Status: source-backed implementation plan; no framework or application code changed.  
Inputs: [01 — Product](01-highlevel-plan.md), [02 — Feasibility](02-feasibility.md), [03 — Architecture and flows](03-system-architecture-and-flows.md).

## 1. Conclusion and evidence boundary

**Use Trestle's existing application structure. Keep gardening functionality application-owned. Send reusable correctness and security fixes upstream before relying on the affected capability.**

Reviewed local `main` in `/Users/gregmushen/work/code/gstack` at **`51bf4d6500657c240515955881eeb9f556cd5925`**, whose create package identifies itself as `0.1.0-alpha.42`. Source was read from an isolated archive of that commit, without switching branches or using uncommitted specs from the checked-out branch.

This review inspected implementation and test source. It did not install dependencies, run the full suite, scaffold the garden app, exercise a database, or verify deployed providers. One dependency-free experiment confirmed that queue configuration replaces an existing hourly cron with the framework's every-minute cron. Other findings below are source-level conclusions or explicit validation requirements, not claims of executed integration tests.

In this document, **framework** means reusable Trestle tooling, templates, and infrastructure. **Application-owned** means custom Easy Garden Plan source inside a generated Trestle project—not another feature added to Trestle itself. Generated code is application-owned after creation; fixes intended for future generated applications also belong in the upstream template and upgrade path.

## 2. Capability matrix

| Product need | What main actually contains | Garden-project work | Disposition |
|---|---|---|---|
| Public site and garden app | Astro/Southwind site; React/TanStack app; Hono Worker | Replace branding, dashboard and route composition; add garden screens | Configure and extend app [S1] |
| Accounts and household | Better Auth organization plugin; explicit create-organization UI | Idempotent automatic household creation, active household selection, consumer language | App feature [S2] |
| Private garden data | `createTenantDatabase`, `withTenant`, restricted runtime role, forced-RLS generator | Garden-specific schemas, repositories, policies and isolation tests | Reuse foundation [S3] |
| Garden CRUD | Generated Zod contracts, service/repository, Drizzle schema, routes, UI, typed client, create event | Extend beyond generic name/form CRUD | Reuse selectively [S4] |
| Polygon and metric measurements | Generator supports string, text, integer, boolean, datetime, relation; no geometry or JSON field type | Typed geometry contracts and custom persistence; precision and revision rules | App model; optional generic field support later [S4] |
| Shared crop/climate data | Resource generation requires tenant + CRUD; no shared-catalog generator | Published reads, privileged editorial writes, import grants and repositories | App policy with reusable scope seam candidate [S4, S5] |
| Editorial permission | Context supports organization/application/platform planes; HTTP resolver populates organization and application only | Resolve explicit editor/platform authority and protect publication endpoints | App policy; reusable resolver candidate [S5] |
| Plans and scheduling rules | Domain package is a minimal starting point | Crop applicability, polygon placement, plan versions, calendar, actual planting state | App feature |
| External garden providers | Email/payments/storage integrations exist; no Geoapify, MapTiler, NWS or Exa adapters | Add provider adapters, normalization, fixtures and rate/cost controls | App integrations [S6] |
| Events and retries | Outbox, inbox, registry, queue consumer, optional Workflow handoff | Semantic events, idempotent garden handlers and persisted jobs | Reuse; strengthen context boundary [S7] |
| Due weather checks | Scheduled handler dispatches outbox and runs artifact cleanup; generated cron wiring exists | Due-location table, leases, bounded dispatch and weather cadence | App scheduler policy; upstream cron fix [S8] |
| Background tenant authority | Committed outbox rows retain tenant provenance; local webhook projection verifies envelope against committed row | General trusted job resolver before private domain work | Extract a framework primitive [S9] |
| Email alerts | Email service, Resend/local adapters, idempotency option, signed Resend receipt endpoint | Feed, delivery intents, event linkage, preferences, stale-alert suppression | App notification feature [S10] |
| Free/Pro | Local and Stripe adapters, plan definitions and entitlement projection | Garden feature codes, Free default, Pro catalog, checkout and enforcement | Reuse; evaluate ordering correctness upstream [S11] |
| Exports | R2 adapter, artifact metadata, signing and maintenance foundations | Garden-diagram rendering and authorized downloads | App renderer; configure infrastructure [S12] |
| Operations and deployment | Doctor, architecture checks, CI, environment configs and provider scripts | Garden-specific health signals and system tests | Extend existing tooling [S13] |

There is no need to finish Trestle's outbound customer-webhook delivery feature to send frost email. Incoming Stripe/Resend webhooks and outbound application email are separate capabilities already represented in the template.

## 3. Proposed project shape

Keep the current planning directory at `/Users/gregmushen/work/code/freegardenplan.com/docs/planning/`. Use **`easygardenplan`** as the proposed internal package/project slug and **easygardenplan.com** as the product domain. Do not rename the user's folder as part of this planning task.

The tree below combines existing Trestle package roots with proposed application files. Child names under domain areas are design proposals, not shipped generators or existing files.

```text
easygardenplan application root
├── .trestle/
│   ├── project.yaml                 # capabilities, environments, secret declarations
│   ├── setup.json                   # reviewed setup intent
│   └── resources/                   # declarations for generated CRUD slices
├── apps/
│   ├── site/src/                    # marketing, pricing, original public guidance
│   ├── app/src/
│   │   ├── main.tsx                 # keep generator registration anchors initially
│   │   ├── routes/                  # app shell, onboarding, gardens, calendar, account
│   │   ├── features/gardens/        # MapLibre view, polygon editor, measurement UI
│   │   ├── features/planning/       # crop selection, plan review, This Week
│   │   ├── features/editorial/      # restricted knowledge review UI
│   │   └── api/                     # generated and custom typed clients
│   └── worker/src/
│       ├── worker-entry.ts          # retain fetch/Workflow export boundary
│       ├── index.ts                 # route and consumer registration
│       ├── execution-context.ts     # authenticated user context
│       ├── services.ts              # extend billing-only service composition
│       ├── resources/               # generated route/event shells
│       ├── routes/                  # planning, progress, editorial commands
│       ├── jobs/                    # weather, research, imports, notifications
│       └── runtime/                 # trusted job context and schedule composition
├── packages/
│   ├── contracts/src/               # wire schemas, geometry, plan/progress commands
│   ├── domain/src/
│   │   ├── gardens/                 # geometry and garden invariants
│   │   ├── knowledge/               # evidence and publishing rules
│   │   ├── planning/                # placement and date calculations
│   │   ├── progress/                # actual plantings and task transitions
│   │   ├── monitoring/              # forecast-independent risk policies
│   │   └── notifications/           # relevance, deduplication, preferences
│   ├── data/src/                    # repository implementations and transactions
│   ├── db/src/                      # Drizzle schemas, RLS, grants and DB primitives
│   ├── db/migrations/               # generated and reviewed SQL plus snapshots
│   ├── events/src/                  # versioned garden event contracts/catalog
│   ├── integrations/src/
│   │   ├── geocoding/               # Geoapify + deterministic local adapter
│   │   ├── weather/                 # NWS + fixtures
│   │   ├── research/                # Exa + fixtures
│   │   ├── climate/                 # dataset readers and normalization
│   │   ├── email/                   # existing adapters + garden templates
│   │   └── payments/               # existing Stripe/local adapters
│   ├── auth/                       # existing Better Auth composition
│   ├── authz/                      # application permission declarations
│   ├── billing/                    # Free/Pro plans and entitlement projection
│   ├── context/                    # authority, clock, logging and execution types
│   └── theme/                      # application-owned design tokens
├── scripts/                        # import/verification and existing deployment scripts
├── seed/                           # representative garden and climate fixtures
├── tests/                          # proposed browser/product-flow tests; add runner
├── config/                         # Trestle encrypted credentials
└── docs/planning/                   # preserve 01–04
```

Keep repository contracts with domain services, following the generated resource pattern. Implement them in `data`; keep Drizzle/provider SDK imports out of `domain` and browser features. Shared geometry algorithms may live in a pure module used by both sides; the server revalidates all edits. Do not create one workspace package per crop or product feature.

The existing `AppServices` currently exposes billing only. Extend it explicitly with garden provider interfaces and email where needed. Define neutral interfaces in a layer domain can depend on without importing provider implementations. Update package dependencies/exports deliberately rather than relying on undeclared transitive imports. [S5, S6]

## 4. Concrete execution paths

### Create or edit a garden

React typed client → authenticated Hono route → `requireExecutionContext` → application-plane permission check → Zod command validation → domain service → tenant-scoped repository → PostgreSQL transaction.

The client may select a household ID, but the server revalidates membership. Use `execution.data` for private records; do not construct an unscoped database client in garden handlers. Organization owner/admin status alone is not application authority. The template recognizes contributor/viewer application roles and stores a contributor default on new membership rows; household onboarding must establish the intended role explicitly. [S2, S3, S5]

For an edit, compare a persisted revision and update atomically. A stale revision returns a conflict. For a semantic transition, write the new state and event in the **same** transaction. The generated create repository demonstrates this with `outboxMessage`; `PostgresOutboxStore.append()` owns a separate connection and is not a substitute for transactional insertion alongside a garden mutation. [S4, S7]

### Generate and activate a plan

Custom planning route → immutable input snapshot → small synchronous calculation or queued plan job → published crop/climate reads plus tenant garden data → plan proposal → user acceptance command → activated version and future tasks.

Generic CRUD must not expose direct mutation of published rules, active-plan history, or arbitrary task state. Those are domain commands. Only create events are emitted by the current generic resource repository; updates/deletes do not automatically provide the semantic event stream the product needs. [S4]

### Weather check and private recommendation

Existing scheduled entry → application due-work dispatcher → shared forecast fetch job → stored forecast version → committed garden evaluation event → queue consumer → verify committed event/provenance → resolve tenant/system context and current entitlements → evaluate → recommendation + notification event transaction.

`createQueueConsumer` supplies validation, inbox claim/completion/release, and retries; it does **not** construct a tenant-aware execution context. Generated event handlers only log receipt. The strong provenance check in `projectWebhookForEvent` is specific to local outbound-webhook mode and returns immediately when that mode is disabled. It must not be mistaken for a general security guard around all consumers. [S7, S9]

Due-location and garden-fanout discovery needs a narrowly authorized operational index with its own grants. Do not defeat forced RLS with a universal tenant scan. The artifact-maintenance control table is a useful precedent, not an authorization policy to copy without review. [S3, S12]

### Alert delivery

Delivery job → resolve trusted tenant → reload recommendation, recipient preferences and entitlement → `EmailService.send` with stable idempotency key → record accepted receipt → verified Resend webhook → associate receipt with private delivery record.

The incoming Resend route already stores deduplicated provider events. Add application linkage and delivery-state projection; a stored provider event is not yet a complete garden notification ledger. Keep urgent advice in application jobs so it can be rechecked immediately before sending. Provider-scheduled email is not our source of truth for mutable frost advice. [S10]

### Research and editorial publication

Authorized editorial command → Exa run → draft records/evidence → validation and review → publish immutable rule version → plans consume published data.

A platform authority plane exists in types, but no default authenticated editor resolver grants it. Define a restricted editor policy separately from household ownership. Shared tables require explicit read/write grants and repositories; pretending shared crops belong to a fictional tenant would obscure the actual security model. [S4, S5]

## 5. Framework gaps: ownership and priority

Priority describes the dependency, not permission to begin framework implementation. This document proposes the disposition; it does not create tickets or modify Trestle.

| Gap | Evidence and assessment | Owner / next action | Required before |
|---|---|---|---|
| **G1. Tenant-safe generated relationships** | `columnExpression` generates a foreign key to the parent's ID only. Child RLS constrains the child's tenant, not the parent's. Generator RLS tests do not exercise a cross-tenant relationship. Source-level integrity gap, not a demonstrated read leak. | **Upstream correctness fix.** Add tenant-aware references/constraints and migration-safe behavior; regression test attempted cross-tenant linkage. Use explicit composite constraints for garden→bed→planting in the app until adopted. | Relying on generated private relationships |
| **G2. Reusable trusted background context** | Inbox protects processing state; consumer gets payload/envelope/environment. Provenance verification exists only in a webhook-specific path. | **Upstream primitive**, extracted from the existing committed-event check, with explicit system authority and tenant context. App owns garden permissions and eligibility. A reviewed local helper can unblock the app; no new all-powerful system role. | Private background jobs |
| **G3. Custom cron preservation** | `renderQueueConfig` unconditionally sets `crons: ["* * * * *"]`. A pure-function experiment confirmed an existing hourly cron is lost. | **Upstream config fix:** merge/deduplicate or explicitly reject conflicts; test preservation. App owns weather frequency. Initially the single framework minute tick can dispatch only due application work, avoiding an extra cron dependency. | Adding independent cron triggers |
| **G4. Billing event ordering** | Normalized events include `occurredAt`, but webhook projection writes subscription state without an observed ordering guard; repository upserts latest-arriving values. Duplicate IDs alone do not handle older distinct events. | **Upstream billing correctness work.** Reproduce out-of-order delivery, then reconcile against canonical provider state or use an appropriate event-order strategy. App owns grace-period/product policy. | Paid Pro launch |
| **G5. Generic scheduling/job registry** | Schedule entry exists, but no generic job/schedule generator or due-work registry was found in CLI registration. | **App first; upstream only the proven reusable part.** Weather leases/cadence stay custom; a small composable scheduled-handler interface may benefit Trestle. Do not delay for a full job platform. | Weather feature implementation |
| **G6. Shared data and editorial authority** | Generator rejects non-tenant mode despite CLI exposing the flag; platform plane lacks a default resolver. | **App schemas and policies now.** Consider upstream explicit shared-resource generation and pluggable authority resolution once requirements are demonstrated. Crop publishing remains custom. Never relax tenant defaults globally. | Crop publication/imports |
| **G7. Geometry and richer field types** | Generator lacks JSON, decimal, enum and geometry fields. | **App custom schemas now.** Generic JSON/decimal support is an optional framework enhancement; spatial types, polygon UI and plant packing stay app-owned. | Bed persistence |
| **G8. Optimistic concurrency and versioning** | Generated update filters ID/tenant and writes timestamp; no expected-revision check. | **App implementation now.** A generic compare-and-swap generator option is a future upstream candidate. Immutable plans and planting history stay custom. | Multi-tab bed editing and plan activation |
| **G9. Notification preferences and ledger** | Delivery adapter and provider receipts exist, not garden-level notification state. | **App feature.** Only provider bugs or a broadly reusable receipt-linking primitive go upstream. Frost rules, quiet hours, feed and deduplication policy remain custom. | Pro notifications |
| **G10. Main-to-project scaffolding ergonomics** | Project name comes from directory basename; dots and nonempty targets are rejected. | **App workflow workaround now.** A separate `--name` option is optional upstream ergonomics; never make the generator overwrite a populated directory by default. | Initial scaffold |
| **G11. Provenance lifetime versus replay** | Background resolution relies on committed outbox records; succeeded outbox rows can be pruned. “Succeeded” means published, not necessarily all downstream work completed. | **Upstream lifecycle evaluation.** Define safe retention/replay contracts. App must retain required provenance through the job/retry window or persist a separate trusted job record before pruning. | Enabling retention cleanup |
| **G12. Clock injection completeness** | Test clock exists; HTTP resolver and generated repositories still construct wall-clock dates. | **App injects clock into new rule/job code.** Upstream consistency improvement for generated infrastructure; no need to block all development. | Deterministic weather replay tests |

### What should not go into Trestle

Geoapify/NWS/Exa garden adapters; MapLibre bed editing; coordinate transformations; crop taxonomy and evidence; regional climate matching; planting schedules; layout optimization; frost thresholds; garden progress; plan acceptance; household-specific onboarding language; Free/Pro product entitlements; research budgets and publishing workflow.

Provider-neutral extension points may be useful to Trestle, but a second weather provider alone does not justify a general framework weather subsystem. Keep custom features as ordinary source in the existing packages and extract a reusable primitive only when its interface and tests are clear.

### Upstream acceptance standard

A proposed framework change should have a domain-neutral use case, a focused regression test, compatible defaults, a generated-project verification case, and an upgrade story for applications that already own generated source. Fix the template/tooling and document how Easy Garden Plan adopts it; do not assume upgrading an npm package rewrites copied application files.

G1 and G4 deserve early upstream fixes. G2 is a valuable security primitive. G3 is a small confirmed configuration defect. G5–G10 largely have safe application-level paths and should not become a prerequisite framework expansion. G11 must be resolved before destructive retention policies are enabled.

## 6. Scaffolding and configuration plan

1. Build or package the generator and CLI from the pinned **main** revision in an isolated checkout. Do not use the checked-out feature branch or assume the public `latest` package matches main. The source version is alpha.42; verify artifact provenance, not just the version label.
2. Generate into a new empty staging directory whose basename is `easygardenplan`. The current `freegardenplan.com` directory fails both the naming rule and empty-target check. Preserve its documentation and `.gitignore`, then reconcile the generated files into the intended root without overwriting existing material. Subsequent name/path assumptions need a boot check after relocation. [S14]
3. Use the generated setup skill and manifest mechanisms during implementation. The present review did not apply that skill or run setup mutations. Establish the local application and baseline checks before adding garden features.
4. Keep queues enabled for durable events. Enable R2 when stored artifacts/import inputs are needed. Enable Workflows only for a demonstrated long-running process. Keep Durable Objects and the optional admin capability off initially; a restricted editorial screen does not require a framework admin suite. Verify generated environment bindings, rather than changing only capability booleans. [S8]
5. Add Geoapify and Exa server secret declarations, MapTiler browser configuration, NWS identification/configuration, and deterministic local adapter modes. Use encrypted Trestle credentials. Do not introduce plaintext `.env` files as an alternate secret system.
6. Replace sample article/workspace billing features with garden Free/Pro entitlements. Preserve independent permission and entitlement checks. Establish a deliberate Free state for a new household; a missing paid subscription must not deny basic garden planning.

### Use generators for the scaffold, not the domain model

Commands present in main include:

```sh
pnpm exec trestle generate resource Garden --tenant --crud
pnpm exec trestle generate email FrostAlert
pnpm exec trestle resources --json
pnpm exec trestle routes --json
```

These are future implementation commands, not commands executed during this review. Resource generation also creates a migration and registers routes/screens. Additional fields must initially be optional; supported types are limited. Shared `Crop` records, geometry, complex relationships and command-oriented plan transitions should use reviewed custom contracts/schemas rather than misleading placeholder text fields. [S4]

`resource add-field` performs source-anchor-based edits, and generation registers against `main.tsx`/Worker entry anchors. Preserve these until initial scaffolding is complete. After custom restructuring, treat source as application-owned and validate generator compatibility; do not expect regeneration to reconcile arbitrary custom code.

## 7. Verification plan

| Stage | Required evidence |
|---|---|
| Baseline | Pinned generator creates a clean app; install, typecheck, tests and build pass; local auth/email/household work |
| Private data | Real PostgreSQL isolation and runtime-role tests; cross-tenant parent linkage rejected; no-context access denied |
| Shared knowledge | Normal users can read only published rules; household owners cannot publish; editor/import privileges are explicit |
| Async | Committed event matches queued envelope; tenant cannot be supplied as authority; duplicates/retries and expired entitlements behave correctly |
| Garden | Concave/excluded geometry, measurements, stale edits, layout fit, plan provenance, actual planting history |
| Weather | Fixed-clock replay, stale/missing feeds, changed forecasts, deduplication and recipient eligibility |
| Billing/email | Duplicate and out-of-order billing events, verified email receipts, ambiguous send outcome, controlled staging recipients |
| Deployment | Runtime role, actual Queue/cron/Workflow/R2 bindings as enabled, provider modes and product smoke tests in staging |

Use `pnpm check`, `pnpm exec trestle architecture check`, and `pnpm exec trestle doctor` as baseline checks, then targeted integration/product tests. `architecture check` is a limited static checker, not a proof of every custom table's RLS or every import boundary. [S13]

Tests can silently skip without their required environments: the system suite checks `TRESTLE_SYSTEM_TEST_DATABASE_URL`; provider tests are opt-in. Generated CI config supplies database-test settings but disables live provider integration tests by default. A green local `pnpm check` without the database/provider prerequisites is not proof of those paths. Inspect skipped counts and run the appropriate suites intentionally. [S15]

Do not claim framework gaps fixed until their focused regression tests pass. Do not claim production readiness from the presence of deployment scripts or roadmap entries.

## 8. Recommended order

1. Prove the pinned scaffold and preserve existing planning files.
2. Reproduce and fix G1/G4 upstream; extract or locally implement the reviewed G2 boundary. Fix G3 when custom cron composition is introduced.
3. Establish household and shared editorial authority, repositories, custom geometry schemas and revision behavior.
4. Implement the garden-to-plan path and the Exa-to-reviewed-catalog path.
5. Connect due weather work, recommendation state and email delivery using existing async primitives.
6. Validate staging behavior and provenance retention before enabling Pro and cleanup jobs.

Framework and application work should be separate changes with explicit adoption points. Safe app implementation can proceed while optional framework ergonomics remain deferred.

## Source index

All links below target the inspected main commit, not the moving branch or the current checkout. Test files are evidence of intended coverage, not proof of a test run in this review.

- **[S1]** [Template manifest](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/.trestle/project.yaml); [App entry](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/apps/app/src/main.tsx).
- **[S2]** [Auth composition](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/packages/auth/src/index.ts); [Membership default migration](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/packages/db/migrations/0007_thin_gravity.sql).
- **[S3]** [Database factories](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/packages/db/src/index.ts); [Tenant helper](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/packages/db/src/tenancy.ts); [Runtime roles](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/packages/db/src/roles.ts).
- **[S4]** [Resource generator](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/cli/src/generate-resource.ts); [CLI commands](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/cli/src/cli.ts); [Generator tests](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/cli/test/generate-resource.test.ts).
- **[S5]** [Context types and clock](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/packages/context/src/index.ts); [HTTP resolver](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/apps/worker/src/execution-context.ts); [Authority tests](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/apps/worker/src/execution-context.test.ts).
- **[S6]** [Service composition](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/apps/worker/src/services.ts); [Integration exports](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/packages/integrations/src/index.ts).
- **[S7]** [Async runtime](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/apps/worker/src/async-runtime.ts); [Async tests](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/apps/worker/src/async-runtime.test.ts); [Event/outbox contracts](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/packages/events/src/index.ts); [Postgres outbox](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/packages/db/src/outbox.ts).
- **[S8]** [Scheduled/queue entry](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/apps/worker/src/index.ts); [Binding/cron generation](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/scripts/queue-config.mjs); [Config tests](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/scripts/queue-config.test.mjs).
- **[S9]** [Committed webhook resolver](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/apps/worker/src/webhook-runtime.ts); [Provenance integration tests](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/apps/worker/src/webhook-runtime.integration.test.ts).
- **[S10]** [Email contract](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/packages/integrations/src/email/types.ts); [Resend adapter](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/packages/integrations/src/email/adapters/resend.ts); [Webhook verifier](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/packages/integrations/src/email/webhooks.ts).
- **[S11]** [Billing plans](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/packages/billing/src/plans.ts); [Projection repository](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/packages/billing/src/repository.ts); [Normalized billing events](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/packages/integrations/src/payments/events.ts).
- **[S12]** [Artifact runtime](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/apps/worker/src/artifact-runtime.ts); [Artifact maintenance](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/apps/worker/src/artifact-maintenance.ts).
- **[S13]** [Architecture checker](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/cli/src/architecture.ts); [Doctor](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/cli/src/doctor.ts); [Upgrade implementation](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/cli/src/upgrade.ts).
- **[S14]** [Project creation](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/src/create-project.ts); [Generator package version](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/package.json).
- **[S15]** [App check scripts](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/package.json); [System test gate](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/apps/worker/src/system.integration.test.ts); [Provider tests](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/packages/integrations/src/provider.integration.test.ts); [Generated CI](https://github.com/gregmushen/trestlejs/blob/51bf4d6500657c240515955881eeb9f556cd5925/packages/create/template/.github/workflows/ci.yml).
