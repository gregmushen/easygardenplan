# Phase 1 Evidence — Private Household and Garden

Claim: every authenticated user receives one usable private garden workspace, and tenant boundaries hold at the API and database layers without requiring a subscription.

Status: complete on September 25, 2026.

## Delivered behavior

- A verified sign-in and the idempotent `/api/workspace/bootstrap` path converge on one hidden household and one default garden.
- PostgreSQL transaction advisory locking serializes simultaneous first requests for the same user.
- The gardener-facing application contains no organization selector or organization creation flow.
- The private Garden aggregate stores its name, confirmed pin, time zone, display units, site notes, monitoring preference and revision.
- Garden read and write permissions and crop-catalog publishing permission are application authority, separate from organization membership roles.
- Garden routes use an explicitly declared permission policy and a tenant-scoped runtime database connection.
- Account deletion removes the owned household, its cascading garden data and pending outbox work.
- Free accounts can read and update their garden without a subscription projection.
- Public and authenticated product surfaces use the Easy Garden Plan identity rather than scaffold product copy.

## Migrations

- `0034_complete_expediter.sql`: generated Garden table, forced RLS policy and restricted runtime grants.
- `0035_special_ink.sql`: one Garden per household and cascading household ownership.
- `0036_low_virginia_dare.sql`: explicit confirmed-location state.
- `0037_charming_moondragon.sql`: account ownership link used for deletion cascade.

All four migrations applied successfully to the isolated local PostgreSQL database. The SetupPlan validates and converges after generation and resource evolution.

## Exit-gate proof

- Browser: a new account signs up, verifies email, signs in, receives its household automatically, saves and reloads the garden, and shows no organization UI. The same run proves the garden is available with a null subscription.
- Concurrency: `household.integration.test.ts` launches eight simultaneous bootstrap calls and proves one household, one garden, one membership and one gardener role result.
- Database isolation: the forced-RLS Garden test proves missing tenant context sees no rows, the correct tenant succeeds, and cross-tenant read, update and delete fail.
- API authorization: the local product integration exercises Garden GET and PATCH through the full authenticated execution context with the `gardener` application role. The system integration also proves a garden save increments the aggregate revision.
- Free access: browser and Worker integration tests both read a null subscription and still successfully read and update the garden.
- Deletion: the household integration invokes the deletion policy and proves both household and Garden rows are gone.

## Verification results

- `pnpm check` with database integration variables: pass, including typecheck, all applicable unit/integration tests and production builds.
- Relevant database suites: Garden RLS pass; Garden event atomicity pass; household concurrency/deletion pass.
- Auth package: 10/10 pass with PostgreSQL enabled.
- Worker package: 136/136 pass with PostgreSQL system tests enabled.
- Local browser gate: 2/2 pass (`local-product` and `site-handoff`).
- `trestle architecture check --json`: 6 pass, 0 fail, including generated Garden files and forced RLS.
- `trestle doctor --env local --json`: 106 pass, 0 warning, 0 fail.
- `trestle plan diff`: converged.

Live provider and deployed-environment checks remain assigned to their provider and launch phases; Phase 1 uses no external provider.
