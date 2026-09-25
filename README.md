# Easy Garden Plan

Easy Garden Plan turns a US garden location, measured growing space and crop choices into a private planting plan and seasonal schedule. The Free product supports planning and progress tracking. The planned Pro product adds active forecast monitoring, frost warnings, resolution notices and timely recommendations.

The application is built on a reviewed Trestle main revision and keeps provider-specific code behind narrow adapters. It currently has a complete deterministic local product path and a green hosted CI baseline. Production remains a deliberate no-go until the external launch gates in [Phase 11](docs/build/phase-11-progress.md) are complete.

## Product flow

1. Create an account and private household garden.
2. Find the garden with Geoapify or place the pin manually.
3. Review hardiness and seasonal context from versioned climate sources.
4. Draw any valid bed polygon, exclusions and measurements.
5. Choose crops and generate a source-traceable proposal.
6. Review, adjust, activate and print the staking plan.
7. Follow the calendar and record actual garden progress.
8. With Pro enabled, receive one notification when risk begins, remain quiet while it continues, and receive a resolution when it clears.

## Local development

Requirements: Node 22 or newer, pnpm 10.33.0 and Docker.

```sh
pnpm install --frozen-lockfile
pnpm exec trestle plan validate .trestle/setup.json
pnpm exec trestle secrets check --env local
pnpm exec trestle db start
pnpm exec trestle db migrate
pnpm dev
```

The local services use:

- public site: `http://localhost:42068`
- authenticated app: `http://localhost:42069`
- API Worker: `http://localhost:8787`

Trestle creates encrypted local credentials. Use `pnpm exec trestle secrets edit --env local` to change them without committing plaintext.

## Verification

```sh
pnpm check
pnpm exec trestle architecture check
pnpm exec trestle doctor --env local
```

The main browser journey needs the migrated local PostgreSQL URL and a built public site:

```sh
pnpm --filter ./apps/site build
TRESTLE_BROWSER_DATABASE_URL="$(pnpm --silent trestle secrets get DATABASE_URL --env local --raw)" pnpm test:browser
```

That journey covers account creation, email verification through local capture, tenant isolation, garden and climate setup, pointer/touch/keyboard bed editing, planning, print output, progress history, notification preferences, Free/Pro transitions, accessibility scans and account deletion.

`main` is protected by the hosted `check` job. It runs frozen installation, Trestle validation, architecture checks, typechecking, PostgreSQL migrations, tests, production builds, Chromium product verification and a Wrangler dry run.

## Architecture

- `apps/site` — public Astro site
- `apps/app` — authenticated React application
- `apps/worker` — Cloudflare Worker API, scheduled monitoring and Queue consumers
- `packages/contracts` — shared request, response and rule schemas
- `packages/domain` — provider-neutral planning, geometry and risk decisions
- `packages/data` — tenant-scoped PostgreSQL repositories
- `packages/db` — schema, migrations, RLS and durable event infrastructure
- `packages/integrations` — Geoapify, NWS, Exa, MapTiler, Resend and Stripe adapters
- `docs/planning` — product, architecture and master implementation plan
- `docs/build` — phase claims, verification results and remaining gates

Durable tenant work starts from a committed event and re-verifies its provenance, tenant and current entitlement before execution. Weather recommendations persist risk state and emit notifications only on meaningful transitions. Published crop rules are immutable, evidence-linked and separate from unresolved research candidates.

## External services

The deployed product expects independently configured credentials and limits for Geoapify, MapTiler, Exa, NWS identification, Resend, Stripe, Cloudflare and Neon. Missing staging configuration fails before provisioning. Provider calls, accepted email, billing events and research attempts feed the aggregate operations report without exposing customer locations or message content.

Never promote extracted horticultural candidates automatically. An authorized catalog editor must inspect the source evidence, record a decision and publish an immutable release.

## Build guide

[The master implementation plan](docs/planning/10-master-implementation-plan.md) is the canonical phase sequence and completion contract. [The launch review](docs/build/phase-11-progress.md) links each phase to its implementation commit and proof, records the nationwide deterministic matrix, and lists the controlled provider, physical-device, editorial and restore gates that remain before production.
