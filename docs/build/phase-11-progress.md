# Phase 11 progress — nationwide validation and launch review

Date: 2026-09-25

## Claim status

**In progress; current decision: no-go for production.** The deterministic local release is coherent and green. Production launch still depends on reviewed horticultural data, provider credentials/configuration, controlled staging evidence, accessibility/device review, measured provider capacity/cost and a production restore record. These are external launch gates rather than hidden local failures.

## Release evidence bundle

| Phase | Application commit | Evidence |
|---|---|---|
| 0 Scaffold | `5904a79` | `docs/build/phase-00-evidence.md` |
| 1 Household/garden | `3bc773b` | `docs/build/phase-01-evidence.md` |
| 2 Knowledge | `6861c1a` | `docs/build/phase-02-progress.md` and `phase-02-coverage.json` |
| 3 Location/climate | `3d7b322` | `docs/build/phase-03-progress.md` |
| 4 Bed editor | `d88d5ab` | `docs/build/phase-04-progress.md` |
| 5 Planner | `d67cdab` | `docs/build/phase-05-progress.md` |
| 6 Progress | `92f38b8` | `docs/build/phase-06-progress.md` |
| 7 Monitoring | `1cdb005` | `docs/build/phase-07-progress.md` |
| 8 Notifications | `0b1e75c` | `docs/build/phase-08-progress.md` |
| 9 Billing | `ea056f4` | `docs/build/phase-09-progress.md` |
| 10 Public/operations | `44561c0` | `docs/build/phase-10-progress.md` |
| 11 Launch validation | current phase commit | this file |

The framework baseline remains pinned to Trestle `c00ca6ab9795fb0bf96e67ffe797125a6220c484`.

## Deterministic nationwide matrix

`pnpm validation:nationwide` passes four consolidated cases. The matrix is deliberately labeled synthetic; it proves product behavior and uncertainty handling, not horticultural correctness.

| Area | Settings/cases | Result |
|---|---|---|
| Climate breadth | cold continental, cool maritime, hot summer, arid, high elevation, frost free, Alaska, Hawaii | Pass; every setting returns a deterministic, explicit result |
| Time and seasons | continental US, Arizona, Alaska and Hawaii timezones; cross-year windows; leap year; dates spanning DST | Pass; schedule dates retain local-calendar semantics |
| Geometry | concave bed, contained exclusion, measured scale correction, partial fit | Pass; valid geometry retained and every requested plant is accounted for |
| Longitude | Alaska antimeridian round trip | Pass; short wrapped longitude is used |
| Uncertainty | missing and conflicting spacing; frost-free calendar behavior | Pass; unresolved reasons are shown instead of invented values |
| Risk/delivery | warning, continuing risk, stale data, confirmed clear, resolution | Pass; one captured warning and one captured resolution; duplicate delivery call stays silent |

Existing phase suites additionally cover stale edits, pinned placement, actual-progress recalculation, duplicate/concurrent weather evaluation, expired event provenance, provider failures, ambiguous delivery receipts, billing order/concurrency, authority re-check at execution and deletion stopping tenant-owned work.

Stripe subscription reconciliation is now also queued after the signed receipt is committed. A PostgreSQL integration proves the webhook returns before contacting Stripe, the Queue consumer retrieves current provider state, and only then acknowledges and projects Pro access.

## Verification

- `pnpm check`: passed.
  - Root Node suite: 65 passed, 0 failed.
  - Root Vitest operational/nationwide/source-normalization/budget suite: 27 passed, 0 failed.
  - Worker with both PostgreSQL integration environments enabled: 149 passed, 0 skipped.
  - Database: 134 passed, 13 skipped environment-specific cases.
  - Integrations: 92 passed, 5 skipped protected live-provider cases.
  - Data: 34 passed, 0 skipped with PostgreSQL enabled.
  - All other workspace suites and production builds passed.
- Local product browser path: passed on desktop Chromium, Firefox and WebKit plus the Pixel 7 Chromium touch-emulation profile, including account, garden, location, touch/click boundary drawing, bed revision, sourced plan, print link, progress, Free/Pro downgrade preservation and deletion. A WCAG 2.0/2.1 A/AA scan runs on the loaded garden editor in all four profiles and passes. These automated profiles do not replace physical-device and screen-reader review.
- Clean-database migration rehearsal: the full journal applies to a disposable database, producing 72 public tables with 39 tables reporting forced RLS. The disposable database was removed after inspection.
- Supported-upgrade rehearsal: the repeatable `pnpm validation:migrations` check installed the application through migration 0049, inserted a representative located/monitored garden, upgraded through migration 0056, preserved the garden, verified all 57 journal entries plus later digest/recommendation/climate-provenance/regional-context columns, and removed the isolated database. Full evidence is in `docs/build/migration-upgrade-rehearsal.md`.
- Product operations snapshot: executed successfully and returned aggregate crop coverage, forecast freshness, monitoring due work, event backlog, delivery outcomes, billing lag and provider usage without customer locations or message content.
- Trestle SetupPlan validation/diff, architecture check and local doctor were rerun after the official climate import; the plan remains converged and doctor reported 106 passed, 0 warnings and 0 failures.

## Remaining controlled gates

- Obtain and configure Geoapify, restricted MapTiler, Exa, NWS, Resend and Stripe staging/production values; publish the verified climate manifests to staging and expand the reviewed crop catalog.
- Run the protected provider workflow after configuration. It now verifies bounded Geoapify, MapTiler street/aerial, Exa, NWS forecast/alert, Resend and Stripe requests and rejects drift between the encrypted and browser-build MapTiler values.
- Run the required end-to-end path in staging with real runtime roles, Queue delivery, scheduled monitoring, NWS retrieval, Stripe test state and an allowlisted Resend recipient.
- Record live geocoder attribution and visually inspect tile attribution with the paid-plan key. The MapTiler policy/export review is recorded and customer print output is enforced as application geometry without provider imagery.
- Complete physical mobile and screen-reader review; automated keyboard, touch emulation, WCAG scanning and Chromium/Firefox/WebKit coverage now pass.
- Measure provider requests and cost at the agreed launch volume; connect provider invoices/rate data to the aggregate usage snapshot.
- Run the protected production backup restore workflow and record provider-backed rollback/forward-recovery notes. The supported prior-revision application migration is now rehearsed locally.
- Close the incomplete claims listed in Phases 2–10. Production deployment and domain cutover require a separate explicit go-live decision.

## Residual risks accepted for continued development

- Local and recorded fixtures establish software behavior but cannot establish nationwide horticultural accuracy.
- The current public price remains `Coming soon`; no paid-launch claim is made until a reviewed Stripe price exists.
- The application now code-splits account, framework, garden, editorial, webhook and location-map code. The ordinary entry chunk is 123 kB minified; the optional MapLibre chunk remains about 1.04 MB and loads only with location tools.
- Quiet-hour suppression and garden-local daily digests are implemented and covered by DST, concurrency, preference, fencing and duplicate-delivery tests. Staging provider evidence remains outstanding.
