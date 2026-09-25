# Phase 0 Evidence — Scaffold and Reproducible Foundation

Claim: a developer can reproduce a healthy Easy Garden Plan foundation from a clean clone, and the enabled Trestle capabilities work locally before product code is added.

Status: complete on September 25, 2026.

## Provenance

- Trestle repository: `https://github.com/gregmushen/trestlejs`
- Source commit: `c00ca6ab9795fb0bf96e67ffe797125a6220c484`
- Reported package version: `0.1.0-beta.1`
- Reproducible CLI artifact: `vendor/trestlejs-c00ca6a.tgz`
- SHA-256: `3add4e103a48a8a8adf7a833e64f0e1f2ea9559bbdf409e9e9d2c9185da66d4c`
- Source record: `.trestle/source.json`

The published `0.1.0-beta.1` package predates the selected main commit despite sharing its version string. The application therefore pins the reviewed tarball rather than resolving the moving or older registry artifact.

## Clean bootstrap

Prerequisites: Node 22 or newer, pnpm 10.33.0, Docker, and the ignored local `config/master.key` supplied through the project's approved secret-key handoff.

```sh
pnpm install --frozen-lockfile
pnpm exec trestle plan validate .trestle/setup.json
pnpm exec trestle plan diff .trestle/setup.json
pnpm exec trestle secrets check --env local
pnpm exec trestle db start
pnpm exec trestle db migrate
pnpm check
pnpm exec trestle architecture check
pnpm exec trestle doctor --env local
```

The local PostgreSQL container uses port `55433` because another local project owns Trestle's default `55432`. Local credentials are encrypted and point to the isolated database.

For the local browser baseline on this shared host:

```sh
APP_URL=http://localhost:42169 \
SITE_URL=http://localhost:42168 \
pnpm --filter ./apps/site build

TRESTLE_BROWSER_DATABASE_URL=postgres://trestle:trestle@localhost:55433/easygardenplan \
TRESTLE_BROWSER_SITE_PORT=42168 \
TRESTLE_BROWSER_APP_PORT=42169 \
TRESTLE_BROWSER_WORKER_PORT=8877 \
SITE_URL=http://localhost:42168 \
APP_URL=http://localhost:42169 \
API_URL=http://localhost:8877 \
pnpm test:browser
```

The connection string above is the generated local-only Docker credential, not a deployed secret.

## Setup-plan result

- `trestle plan validate`: pass.
- `trestle plan diff`: converged; every item `already correct`.
- `trestle apply --yes`: pass and setup state recorded.
- No admin, R2, Queue, Workflow or Durable Object capability is enabled yet.
- No remote resource, deployment, DNS change, paid service or production secret was created.

Known CLI deviation: `trestle plan init` at the pinned commit rejects the starter it creates because the manifest has optional secrets with empty `required` lists and an admin-target secret, while the SetupPlan schema accepts neither. The checked-in plan is the equivalent schema-valid intent and remains governed by Trestle validate/diff/apply. This does not affect generated runtime code.

## Verification results

- `pnpm check`: pass; typecheck, tests and all builds complete.
- Initial no-database test run explicitly reported database-backed skips.
- Database-enabled workspace rerun: all database, billing, auth and Worker integration suites pass, including 146/146 database tests, 6/6 billing tests, 9/9 auth tests and 136/136 Worker tests.
- Provider integration suite: 81 pass, 4 skipped because live provider verification is not enabled. These are launch/staging evidence, not Phase 0 requirements.
- `trestle architecture check`: 4 pass, 0 fail.
- `trestle doctor --env local`: 104 pass, 0 warning, 0 fail.
- SetupPlan convergence: pass.
- Local browser: 2 applicable tests pass; 4 preview/staging/live-email suites skip by environment as designed.
- PostgreSQL container: healthy; generated migrations apply successfully and repeat idempotently.
- Local encrypted credentials: valid.

## Hosted repository baseline

- Canonical remote: `https://github.com/gregmushen/easygardenplan.git`.
- GitHub environments exist for preview, staging and production; no provider credential was invented or copied into them.
- CI run `36159176920` passed on commit `442423bb87c1591f54b52c885837bc5aff8b4c4b`: frozen install, Trestle validation and architecture, typecheck, PostgreSQL migration, full tests, production builds, Chromium product journey and Wrangler validation all succeeded.
- Deploy run `36159176848` stopped before provisioning because staging encrypted credentials, email deployment configuration and Stripe settings are absent. It reported 110 doctor checks passed and three configuration failures; the production job was skipped.

## Incidents resolved during proof

- Default PostgreSQL and web ports were occupied by unrelated local projects. Easy Garden Plan uses isolated ports and did not stop those processes.
- The first alternate-port browser run sent direct test requests to the default app URL; supplying the explicit app/API/site origins corrected the test target.
- The static site initially contained its default local app link; rebuilding it with the isolated `APP_URL` produced the correct handoff and the test passed.

## Remaining environment-only evidence

Preview, staging, production, live Stripe, live Resend and external-provider checks are intentionally deferred to their owning phases. Their absence does not weaken the Phase 0 claim, which is specifically the reproducible local foundation.
