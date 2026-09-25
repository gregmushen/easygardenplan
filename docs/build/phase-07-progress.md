# Phase 7 progress evidence — weather monitoring and recommendation state

Recorded: September 25, 2026

Status: **in progress**. Deterministic monitoring, background authority, scheduling, NWS normalization, official cold-alert policy and transition persistence are implemented and verified. The phase remains open for a reviewed launch cold-response catalog and deployed Queue evidence.

## Implemented and proved

- The NWS adapter follows the official point-discovery and hourly-grid flow, supplies an identifying `User-Agent`, accepts provider timestamps with UTC offsets, normalizes Fahrenheit/Celsius to Celsius and keeps source update time separate from retrieval time.
- Forecast snapshots are immutable and deduplicated by provider source and content fingerprint. Evaluations retain the exact snapshot and a typed trace.
- Official-alert snapshots retain NWS identity, issuance/effective/expiry times, cancellation state, source link and area description. Each result from the NWS point query is linked to the garden whose coordinate produced the match, and repeated retrieval is idempotent.
- Actual NWS Freeze Watches, Freeze Warnings, Hard Freeze Watches/Warnings and Frost Advisories create garden-wide urgent official-alert episodes with stable provider-based identities. Updates do not duplicate warnings. Explicit cancellation or a previously supplied expiry resolves the episode once; provider failure, a test message, an unrelated advisory or an empty active-alert response cannot manufacture an all-clear.
- The garden displays matched official notices separately from crop recommendations, including event/headline, matched area, validity and a link to the original NWS notice.
- Cold evaluation consumes only explicit published `climate_response` thresholds for the matching crop and actual growth stage. It does not invent a universal frost threshold.
- Each reviewed climate-response rule must also define a higher clear threshold and the number of fresh clear confirmations. Forecasts inside that hysteresis band hold the existing state, and only the configured number of readings above the clear threshold can resolve an episode.
- A persisted state exists per garden, hazard and crop/stage group with `unknown`, `clear`, `active` and `resolved`, supporting snapshot, current episode, clear-confirmation count and revision.
- PostgreSQL advisory locking serializes overlapping evaluation attempts. Recommendation versions and semantic transitions are append-only; state and the transition outbox event commit in one transaction.
- The fixed-clock sequence proves warning once → repeated active silent → stale/unavailable becomes unknown without resolution → two fresh clear confirmations → resolution once → repeated clear silent → renewed warning in a new episode.
- Freshness fixtures prove that a fresh retrieval of provider data with an old source timestamp is still stale, missing source-age configuration fails closed, and an hourly response with no forecast intervals is rejected.
- Action/effected-set changes create a material-change transition; mere forecast fingerprint/retrieval changes remain silent.
- A narrow due index stores garden/tenant IDs, location revision, due time and bounded lease state without coordinates. Platform discovery claims it with `SKIP LOCKED`, then opens tenant-scoped data to commit a tenant-provenanced evaluation event.
- The evaluation consumer declares tenant authority and the current `weather.monitoring` entitlement. The framework re-verifies the committed event, tenant and current entitlement at each Queue/Workflow execution.
- Monitoring eligibility is updated atomically when a garden's location or monitoring preference changes. Hourly scheduling is an application cron; Trestle's framework minute tick remains separate.
- A PostgreSQL lifecycle test proves an incomplete garden has no due work; enabling monitoring at a confirmed location creates it; relocation advances the location revision, clears a previously claimed lease and resets failures; disabling removes it; and garden deletion removes it even after re-enabling.
- Planting and task completion are re-read immediately before notification delivery and suppress obsolete warnings. The Workflow execution suite separately proves a Pro entitlement revoked after Queue creation prevents the handler from running, including resumed execution.
- Staging and production explicitly select live NWS mode and fail closed when the provider's own update timestamp is more than six hours old. Local and preview environments retain deterministic fixture mode. The Queue-config test proves Trestle rendering preserves this application policy and the required NWS identity credential.
- The protected staging provider workflow resolves the NWS identity through Trestle and performs bounded forecast and active-alert requests for one representative point before a staging release is accepted.
- Free guidance and persisted monitoring status are visible in the garden. Pro evaluation requests are entitlement-gated at both HTTP and background boundaries.
- PostgreSQL integration: concurrent warning evaluation created one warning; resolution and renewed risk created one semantic transition each; shared snapshots deduplicated; due work was claimed once and emitted one committed tenant event.

## Controlled live NWS check

The adapter retrieved the San Francisco hourly grid on September 25, 2026 using the official NWS API. It resolved `MTR/85,105`, normalized 156 hourly intervals, retained source update `2026-09-25T08:26:01Z`, retrieval `2026-09-25T12:20:05.988Z`, horizon through `2026-10-02T00:00:00Z`, and content fingerprint prefix `f6d38c1ad1b3`. This proves the current provider shape, not production freshness or crop advice.

References: [NWS API Web Service](https://www.weather.gov/documentation/services-web-api), [NWS Alerts Web Service](https://www.weather.gov/documentation/services-web-alerts).

## Framework/setup note

`trestle plan diff` identified queue enablement correctly, but `trestle apply` intentionally blocks capability updates. The project manifest was changed to the reviewed queue declaration, after which `trestle plan diff` converged. Existing Trestle queue rendering, provisioning, verification and event-runtime code remains the implementation path; no parallel queue system was introduced.

## Remaining exit evidence

- Publish reviewed cold-response rules with stage thresholds/actions and run the representative nationwide matrix.
- Reassess the six-hour `NWS_MAX_SOURCE_AGE_MINUTES` ceiling with staging observations before launch. Missing or invalid configuration still makes live source freshness unusable rather than assuming safety.
- Validate NWS point matching against polygon/partial-area alerts in staging. The local policy, cancellation/expiry behavior and source-attributed customer display are covered; an empty active-alert response is deliberately not treated as an all-clear.
- Run the Queue and hourly application cron in staging with real runtime roles and retain a normalized live snapshot/evaluation trace there.
