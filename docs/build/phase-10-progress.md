# Phase 10 progress — public product, operations and privacy

Date: 2026-09-25

## Claim status

**In progress.** The local product now makes accurate public claims, exposes a fail-closed product readiness result, and proves household deletion. Completion still requires deployed operational drills, production provider configuration, map attribution review against a live map, and a production backup/restore record.

## Implemented

- Replaced the remaining starter identity and placeholder legal copy with Easy Garden Plan content.
- Added a public, explicitly illustrative sample plan covering place, bed layout, calendar and transition-based frost guidance.
- Kept Pro pricing at `Coming soon` until an approved live price exists and explained that cancellation preserves Free garden data.
- Added product-specific privacy and terms pages describing the data, providers, deletion behavior and limits of garden/weather guidance.
- Added `GET /api/health/product`, which reports only boolean readiness and missing component names for the published catalog, climate data, Geoapify, MapTiler, Exa, NWS, Resend, Stripe and Queue binding. It never returns credentials.
- Declared the additional production provider credentials in the Trestle manifest and SetupPlan.
- Enabled authenticated account deletion. Household-owned data, pending outbox work, entitlements, subscriptions and billing ownership are removed before Better Auth removes the user.
- Extended database and browser tests to prove billing rows and the private garden/household disappear after deletion.
- Retained the existing bounded and audited recovery controls: committed-event age checks, tenant-scoped webhook replay, lease recovery, artifact recovery evidence and scheduled isolated backup verification.
- Added `pnpm operations:product`, an aggregate-only operator snapshot for crop coverage, forecast freshness, overdue/retrying gardens, event backlog, delivery outcomes, billing lag and geocoder usage. It does not emit customer locations or message content.

## Proof recorded

- `pnpm check`: passed (typecheck, unit/integration suites and production builds).
- Local product browser path: passed, including product readiness, signup, verification, garden/location/bed/plan/progress, Free → Pro → Free, preserved garden, then account deletion and database absence checks.
- `trestle plan validate`: passed.
- `trestle plan diff`: converged.
- `trestle architecture check`: passed.
- `trestle doctor --env local`: 106 passed, 0 warnings, 0 failed.
- Static-site tests prove every public route builds without browser JavaScript and reject starter/placeholder brand copy.

## Remaining exit evidence

- Exercise readiness in staging with real Geoapify, MapTiler, Exa, NWS, Resend, Stripe and Queue configuration.
- Record distinct staging drills for stale weather, failed delivery, delayed billing and expired work.
- Review live map attribution and provider export rights; printed garden diagrams currently contain application geometry only and no provider imagery.
- Record a successful isolated production restore from the scheduled Trestle backup workflow.
- Connect provider billing exports to the request-count snapshot so the operator view can report actual cost as well as usage.
- Review production analytics/error tooling after it is selected; automated logger fixtures already cover credential and payload redaction.
