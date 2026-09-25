# Phase 3 progress evidence — location and climate

Recorded: September 25, 2026

Status: **external provider gate**. The local, provider-neutral location flow and real USDA/OSU plus NOAA climate pipeline are implemented and verified. The exit claim remains open until Geoapify and MapTiler credentials are configured for controlled live checks.

## Implemented

- Server-side Geoapify forward-geocoding adapter using the current `/v1/geocode/search` contract, US filtering, normalized multiple candidates, timezone metadata, bounded timeouts and retryable rate/provider failures.
- A durable per-household geocoding rate counter. Address text is sent only to Geoapify and is not written to usage records or structured request logs.
- Revision-safe location confirmation with explicit `geocoded` or `manual_pin` provenance. A stale confirmation receives a conflict instead of overwriting a newer garden revision.
- MapLibre garden map with MapTiler aerial/map layers, provider attribution, a visible pin and coordinate entry. When tile configuration or imagery is unavailable, the measured/manual path remains usable.
- The protected staging provider workflow resolves Geoapify and MapTiler values through Trestle, checks one representative US geocode, loads both street and aerial style documents, and verifies that the encrypted MapTiler value matches the key used for the browser build.
- Versioned climate dataset, normalized record and immutable garden-association storage. Shared datasets are separate from forced-RLS household associations.
- Hardiness and frost normals are independently versioned and matched. A garden association freezes both source releases, record identities, attribution, distance, elevation difference and confidence, preventing the latest imported source from silently replacing the other climate dimension. The synthetic combined fixture is eligible only when neither real source kind is published.
- National point releases use indexed, expanding coordinate windows with a bounded candidate set and exact great-circle ranking. Longitude search wraps at the antimeridian, avoiding full-release reads in the Worker.
- Checksum-verified atomic climate publication with idempotent replay. The prior published dataset remains intact if validation fails.
- Nearest-record matching with distance, elevation context, confidence and explicit `known`, `frost_free`, `unknown` and `uncertain` states.
- Gardener-supplied seasonal anchors with private provenance; they are never labeled as NOAA data.
- A synthetic eight-location fixture covering cold continental, cool maritime, hot summer, arid, high elevation, frost-free, Alaska and Hawaii contract behavior. It is explicitly not product climate guidance.
- The real NOAA 1991–2020 v1.0.1 archive normalized to 7,083 usable station records, and the four 2023 USDA/OSU grids normalized to 460,718 transformed hardiness samples across CONUS, Alaska, Hawaii and Puerto Rico. Both checksum-verified manifests were published locally. Exact hashes, validation totals and match results are recorded in `real-climate-import-evidence.md`.
- The gardener-facing climate summary displays the frozen source release and attribution for every matched dataset.

## Proof

- PostgreSQL integration publishes eight checksum-verified records, proves idempotent replay, rejects a mismatched checksum, matches a representative location and proves another tenant cannot read or replace the association.
- A separate-source PostgreSQL case combines a USDA/OSU-style hardiness record with a NOAA-style frost-normal record and proves both attributions remain in the immutable association.
- An antimeridian PostgreSQL case proves a frost station at 179.8° is found from -179.9° without a global in-memory scan.
- Worker system coverage exercises local no-result geocoding, manual pin confirmation, stale-revision rejection, climate association, gardener anchor replacement and current-association reading.
- Unit coverage checks Alaska/Hawaii coordinates, IANA timezone validation, frost-state distinctions, invalid ranges, Geoapify normalization/rate errors and antimeridian distance behavior.
- Browser proof: account → garden → tile-unavailable fallback → manual pin → climate match → gardener seasonal anchor → reload; 1 passed.
- Deterministic fixture import recorded release `representative-v1`, 8 accepted, 0 rejected, checksum `a8ca7be3f6a20e1a17193e8cf2700fe2e550b8e8f1966124bb4a0c769ba6f6dc`.
- Real-source validation matched Minneapolis, Seattle, Dallas, Phoenix, Aspen, Miami, Anchorage, Honolulu and San Juan to both current releases in 8.1–35.2 ms per garden. It produced known dates for six climates and explicit frost-free states for Miami, Honolulu and San Juan.

## Verification

- `pnpm check`: passed after the real-source normalizers and attribution UI. Root Node scripts: 65 passed. Supporting operational Vitest suites: 24 passed. Workspace suites passed, including integrations 92, database 134, data 34, auth 10 and worker 149. Five protected live-provider cases and thirteen environment-specific database cases remain explicitly skipped by their owning packages; the phase-specific PostgreSQL suites ran and passed.
- `pnpm trestle plan diff .trestle/setup.json`: converged after applying the current plan.
- `pnpm trestle architecture check`: 6 passed.
- `pnpm trestle doctor`: 106 passed, 0 warnings, 0 failed.

## Remaining exit evidence

- Configure encrypted `GEOAPIFY_API_KEY`, configure the origin-restricted `MAPTILER_PUBLIC_KEY`, and record controlled candidate, no-result, rate and map/aerial checks.
- Run controlled weak-match/provider-gap cases against the deployed dataset after staging import; the real local nine-location matrix now passes.
