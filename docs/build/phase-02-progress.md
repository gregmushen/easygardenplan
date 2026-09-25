# Phase 2 progress evidence — crop knowledge

Recorded: September 25, 2026

Status: **in progress**. The deterministic editorial and publication pipeline is implemented and verified. The phase remains open because the environment does not contain `EXA_API_KEY`, so a controlled live Exa run and a reviewed horticultural launch catalog cannot yet be claimed. This does not block later phases that consume the published-rule contract and deterministic fixtures.

## Implemented

- Shared crop, alias, variety, source, research-run, evidence, rule-family/version, review-decision and catalog-release storage.
- Typed applicability and nine rule payload families with explicit `known`, `not_applicable`, `unknown` and `conflicted` states.
- Restricted editorial APIs and application screen for draft creation, review, publication, withdrawal and replacement.
- A current Exa search adapter with deterministic request fingerprints, resumable provider-run storage, usage/cost capture, rate-limit handling and public-URL safeguards.
- The protected staging provider workflow resolves the encrypted Exa credential through Trestle and performs one bounded source-discovery request, proving authentication, response normalization and cost/usage capture without publishing any result.
- Atomic publication with accepted-review and evidence checks. Published rule content is database-protected from mutation; corrections create new versions. Explicit historical releases continue to resolve withdrawn versions while the current catalog excludes them.
- Ordinary gardener access is limited to published catalog data; editorial routes require `catalog.publish`.
- A deterministic representative fixture covers all nine initial rule shapes and eight launch climate/region classes. It is explicitly synthetic and is not horticultural advice.

## Proof

- PostgreSQL editorial integration: research run → source/evidence-backed draft → accepted review → atomic publication → planner-readable catalog.
- The same integration creates a correction, publishes version 2, withdraws version 1 with a replacement, and proves release 1 still resolves version 1 while the current catalog resolves version 2.
- PostgreSQL rejects mutation of already-published rule content.
- Research-run integration proves identical work resumes from the stored result, records attempt/usage/cost data and rejects private or insecure source URLs.
- Contract tests reject malformed ranges and customer data in research briefs and preserve all four knowledge states.
- Worker system tests prove a gardener can read the published catalog and receives `403` from editorial list and publication routes.
- Generated coverage artifact: `docs/build/phase-02-coverage.json` — 216 contract cells: 72 supported, 0 partial, 144 missing and 0 conflicted. Missing cells remain explicit.

## Verification

- `pnpm check`: passed. Root scripts: 65 passed. Supporting Vitest suites: 17 passed. Workspace suites passed, including contracts 4, integrations 84, database 134, data 5, auth 10 and worker 136. Four pre-existing opt-in live integration tests and thirteen environment-dependent database tests reported as skipped by their owning packages; the phase-specific PostgreSQL suites ran with the local restricted database URL and passed.
- `pnpm trestle plan diff .trestle/setup.json`: converged.
- `pnpm trestle architecture check`: 6 passed.
- `pnpm trestle doctor`: 106 passed, 0 warnings, 0 failed.

## Remaining exit evidence

- Configure the encrypted `EXA_API_KEY` credential and record one controlled live research run.
- Use source-backed research and editorial review to expand the synthetic contract fixture into the declared launch crop catalog.
- Regenerate the coverage report from that reviewed catalog and record its supported, partial, missing and conflicted product coverage.
