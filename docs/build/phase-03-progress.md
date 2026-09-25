# Phase 3 progress evidence — location and climate

Recorded: September 25, 2026

Status: **in progress**. The local, provider-neutral location and climate flow is implemented and verified. The exit claim remains open until Geoapify and MapTiler credentials are configured for controlled live checks and real USDA/OSU and NOAA releases pass the versioned import pipeline.

## Implemented

- Server-side Geoapify forward-geocoding adapter using the current `/v1/geocode/search` contract, US filtering, normalized multiple candidates, timezone metadata, bounded timeouts and retryable rate/provider failures.
- A durable per-household geocoding rate counter. Address text is sent only to Geoapify and is not written to usage records or structured request logs.
- Revision-safe location confirmation with explicit `geocoded` or `manual_pin` provenance. A stale confirmation receives a conflict instead of overwriting a newer garden revision.
- MapLibre garden map with MapTiler aerial/map layers, provider attribution, a visible pin and coordinate entry. When tile configuration or imagery is unavailable, the measured/manual path remains usable.
- Versioned climate dataset, normalized record and immutable garden-association storage. Shared datasets are separate from forced-RLS household associations.
- Checksum-verified atomic climate publication with idempotent replay. The prior published dataset remains intact if validation fails.
- Nearest-record matching with distance, elevation context, confidence and explicit `known`, `frost_free`, `unknown` and `uncertain` states.
- Gardener-supplied seasonal anchors with private provenance; they are never labeled as NOAA data.
- A synthetic eight-location fixture covering cold continental, cool maritime, hot summer, arid, high elevation, frost-free, Alaska and Hawaii contract behavior. It is explicitly not product climate guidance.

## Proof

- PostgreSQL integration publishes eight checksum-verified records, proves idempotent replay, rejects a mismatched checksum, matches a representative location and proves another tenant cannot read or replace the association.
- Worker system coverage exercises local no-result geocoding, manual pin confirmation, stale-revision rejection, climate association, gardener anchor replacement and current-association reading.
- Unit coverage checks Alaska/Hawaii coordinates, IANA timezone validation, frost-state distinctions, invalid ranges, Geoapify normalization/rate errors and antimeridian distance behavior.
- Browser proof: account → garden → tile-unavailable fallback → manual pin → climate match → gardener seasonal anchor → reload; 1 passed.
- Deterministic fixture import recorded release `representative-v1`, 8 accepted, 0 rejected, checksum `a8ca7be3f6a20e1a17193e8cf2700fe2e550b8e8f1966124bb4a0c769ba6f6dc`.

## Verification

- `pnpm check`: passed. Root scripts: 65 passed. Supporting Vitest suites: 17 passed. Workspace suites passed, including contracts 7, integrations 87, database 134, data 8, auth 10 and worker 136. Four opt-in live integration tests and thirteen environment-dependent database tests remained skipped in their owning packages; the phase-specific PostgreSQL suites ran and passed.
- `pnpm trestle plan diff .trestle/setup.json`: converged after applying the current plan.
- `pnpm trestle architecture check`: 6 passed.
- `pnpm trestle doctor`: 106 passed, 0 warnings, 0 failed.

## Remaining exit evidence

- Configure encrypted `GEOAPIFY_API_KEY`, configure the origin-restricted `MAPTILER_PUBLIC_KEY`, and record controlled candidate, no-result, rate and map/aerial checks.
- Import declared real USDA/OSU hardiness and NOAA frost-normal releases with their source URLs, checksums, attribution, validation totals and rejected records.
- Run and record the representative-location matrix against those real published datasets, including weak matches and provider-coverage gaps.

