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
| 4 Bed editor | `eda3c12` | `docs/build/phase-04-progress.md` |
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

## Verification

- `pnpm check`: passed.
  - Root Node suite: 65 passed, 0 failed.
  - Root Vitest operational/nationwide suite: 21 passed, 0 failed.
  - Worker: 121 passed, 17 skipped provider/database-environment cases.
  - Database: 134 passed, 13 skipped environment-specific cases.
  - Integrations: 90 passed, 4 skipped live-provider cases.
  - All other workspace suites and production builds passed.
- Local product browser path: passed in Phase 10, including account, garden, location, concave bed revision, sourced plan, print link, progress, Free/Pro downgrade preservation and deletion.
- Clean-database migration rehearsal: passed all 47 journal entries into a disposable database; 68 public tables created and 38 tables reported forced RLS. The database was destroyed after verification.
- Product operations snapshot: executed successfully and returned aggregate crop coverage, forecast freshness, monitoring due work, event backlog, delivery outcomes, billing lag and provider usage without customer locations or message content.
- Trestle SetupPlan validation/diff, architecture check and local doctor passed in Phase 10; doctor reported 106 passed, 0 warnings and 0 failures.

## Remaining controlled gates

- Obtain and configure Geoapify, restricted MapTiler, Exa, NWS, Resend and Stripe staging/production values; publish real reviewed climate and crop datasets.
- Run the required end-to-end path in staging with real runtime roles, Queue delivery, scheduled monitoring, NWS retrieval, Stripe test state and an allowlisted Resend recipient.
- Record live geocoder/tile attribution and export-rights review. Customer print output currently contains application geometry and no provider imagery.
- Complete keyboard, screen-reader, touch and supported browser/device review.
- Measure provider requests and cost at the agreed launch volume; connect provider invoices/rate data to the aggregate usage snapshot.
- Rehearse the supported prior-revision migration, run the protected production backup restore workflow, and record rollback/forward-recovery notes.
- Close the incomplete claims listed in Phases 2–10. Production deployment and domain cutover require a separate explicit go-live decision.

## Residual risks accepted for continued development

- Local and recorded fixtures establish software behavior but cannot establish nationwide horticultural accuracy.
- The current public price remains `Coming soon`; no paid-launch claim is made until a reviewed Stripe price exists.
- The application bundle has a build-time size warning and should be split before traffic makes initial load performance material.
- Quiet-hour fields are persisted but delivery deferral/digest behavior is not complete; launch messaging must not claim those features.
