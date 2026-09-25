# Easy Garden Plan — Feasibility Assessment

Research date: September 24, 2026  
Scope: feasibility only; no implementation, provider provisioning, or deployment.  
Related plan: [01-highlevel-plan.md](01-highlevel-plan.md)

## Verdict

**The Free planner and weather-aware Pro product are feasible. Google Solar API is not a suitable default dependency under its current published terms.**

Proceed with a US-first planner using user-confirmed bed dimensions and sunlight observations. Use historical climate information for the baseline schedule and short-range forecasts for Pro adjustments. Automated ground-level shade estimation should remain optional research.

This is a documentation and source-code assessment, not a working integration proof. No paid API calls, real-address trials, field measurements, or deployed Trestle tests were performed. Provider prices and terms below were checked on the research date.

## Accepted scope decisions — September 24, 2026

- **Coverage:** launch across all US regions, including Alaska and Hawaii; no single-region launch restriction. This continues the US scope of the high-level plan, not a worldwide expansion.
- **Geometry:** arbitrary valid polygon beds, including concave outlines; support vertex editing and measured dimensions. Validate geometry and provide correction for crossed edges. Plant footprints and spacing must fit inside the usable polygon.
- **Crop library:** build a broad vegetable and herb library with Exa research, without a fixed 20-crop cap. Use the user’s existing Exa credits; account connection remains open.
- **Mapping:** address search → aerial imagery → place and size polygon beds. Aerial imagery is required at launch; a plain diagram remains a fallback for individual locations.
- **Pro:** near-term planting recommendations and frost-risk updates through email and an in-app feed. Watering advice, pest prediction, SMS, and push remain deferred.

Nationwide coverage is accepted scope. It requires validation across contrasting climates and explicit handling of frost-free locations, multiple growing seasons, heat constraints, and incomplete provider data. Those checks do not restrict launch to a pilot region.

## Feasibility by capability

| Capability | Assessment | Main condition |
|---|---|---|
| Address entry and garden location | Feasible | Confirm the garden pin; an address identifies a property, not its beds |
| Growing-zone lookup | Feasible with data integration | Use the official dataset and preserve its attribution conditions |
| Historical frost-based schedule | Feasible | Use frost probabilities and locally appropriate climate data, not zone alone |
| Draw and measure beds | Feasible | Field measurements must control planting dimensions |
| Automated sunlight from Google Solar | Exclude under standard published terms | Energy-system use restriction; separate ground-level accuracy questions |
| Manual sunlight assessment | Feasible | Record observation date/season and allow corrections |
| Crop layout and planting calendar | Feasible with curated rules | Crop knowledge and regional validation are substantial work |
| Weather-adjusted recommendations | Feasible | Limit changes to the forecast horizon; track actual planting progress |
| Frost alerts | Feasible with operational testing | Combine official alerts with crop-specific forecast rules |
| Trestle foundation | Suitable, not yet verified for this application | Prove deployed scheduling, retries, billing, and email delivery |

## 1. Address, maps, and staking out the garden

**Selected geocoder: Geoapify** (user decision, September 24, 2026). Start with an explicit address submission, let the user confirm or correct the garden pin, and persist the location with required attribution. Autocomplete is optional and must be included in usage estimates if added.

Geoapify permits commercial use on its free plan within usage limits and with the required attribution. Its geocoding documentation permits storing results while preserving data-source attribution. Validate address quality across representative US regions before implementation. [Geoapify geocoding documentation](https://www.geoapify.com/geocoding-api/)

**Selected map stack:** MapLibre GL JS for rendering, MapTiler Cloud for the street basemap and satellite/aerial imagery, and Geoapify for geocoding. Geocoding does not supply aerial imagery or settle map-hosting costs. Terra Draw is a candidate for the bed-drawing interaction; test its integration with the selected renderer on mobile. [Terra Draw repository](https://github.com/JamesLMilner/terra-draw)

The map should locate beds and establish orientation. A dimensioned bed editor should determine plant spacing and quantities. Let users edit polygon vertices, confirm measured edge lengths, rotate a bed, and position it relative to a physical reference such as a fence. Generate a staking diagram from those confirmed measurements. Do not promise survey accuracy from imagery or a phone location.

Support arbitrary valid polygons, including concave beds. Geometry validation, boundary clearance, and fitting complete plant footprints inside narrow or irregular areas are required. A basic layout engine can use spacing, bed boundaries, access, and user preferences; finding a mathematically optimal garden is unnecessary.

Google Geocoding is excluded from this combination: its current non-EEA terms prohibit using its content with a non-Google map. Keep user-entered measurements and garden records distinct from provider content. [Google service-specific terms, §6.2](https://cloud.google.com/maps-platform/terms/maps-service-terms)

**Unproven:** address coverage across US regions, satellite image usefulness, touch editing, and whether gardeners can reproduce the printed dimensions on the ground.

## 2. Growing zones and frost dates

### Growing zones

The official 2023 USDA hardiness datasets are available through Oregon State University in GIS and ZIP-code forms. USDA says OSU owns the underlying datasets and permits reproduction and redistribution subject to conditions concerning attribution and modified maps. This is an attribution/integration task, not evidence that a paid zone API is required. [USDA map creation and data terms](https://planthardiness.ars.usda.gov/pages/map-creation)

Prefer a coordinate-based lookup when available; ZIP-level lookup can be a fallback with its lower precision explained. Do not make the public website's interactive lookup an undocumented production dependency.

### Frost dates

NOAA's 1991–2020 Climate Normals include frost/freeze dates and related agricultural variables. They are a credible baseline dataset, but selecting representative stations and interpreting the probabilities still requires work. A nearby station can be unrepresentative because of terrain, elevation, or coastal exposure. [NOAA Climate Normals](https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals)

Store the chosen source, period, station/location, temperature threshold, and probability definition. Present an estimated planting window rather than treating one average date as a guarantee. Handle places with no typical freeze or insufficient data explicitly.

**Decision:** hardiness zone is context; historical frost risk, crop requirements, and local conditions drive the calendar. Launch across all US regions, validating regional rules and representing uncertainty or missing data explicitly.

**Unproven:** exact downloadable variables, ingestion format, station-selection method, and agreement with local extension guidance across representative US locations.

## 3. Sunlight estimation: change the original assumption

### Google Solar API

The decisive issue is permitted use. Google's non-EEA service-specific terms, §20.1, restrict Solar API to energy-system feasibility, design/installation, and defined energy-system transactions. A garden planner does not appear to fit those purposes. **Exclude it unless Google provides applicable permission.** Section 20.2 also limits temporary Solar Data caching to 30 days, with an exception tied to specified downstream transactions. [Google service-specific terms, §20](https://cloud.google.com/maps-platform/terms/maps-service-terms)

There is technical potential, but it is not proof of garden accuracy: the API exposes unmasked flux beyond roofs and hourly shade rasters at one-meter resolution. The shade encoding uses standard time without daylight saving. Those properties would require careful interpretation for small beds. They do not establish that the model correctly represents sunlight beneath tree canopies, recent fences, or changing seasonal foliage. [Solar DataLayers reference](https://developers.google.com/maps/documentation/solar/reference/rest/v1/dataLayers)

### Feasible alternatives

1. **Launch with observed sunlight:** guide the gardener to check the bed at intervals, record approximate direct-sun hours and the observation date, and revise the result as the season changes.
2. **Evaluate a dedicated shade provider:** ShadeMap advertises JavaScript sunlight/shadow tools and support for building data. Commercial terms, embedded-app pricing, tree coverage, and ground-level accuracy still need validation; it is a research candidate, not a selected vendor. [ShadeMap developer overview](https://shademap.app/about/)
3. **Consider our own model later:** sun-position calculations alone do not solve shade. Reliable terrain, building, and vegetation geometry would be the difficult input.

**Decision:** sunlight automation must not block the Free planner or Pro weather monitoring. Avoid promising exact sunlight hours from an address alone.

## 4. Crop data and planting recommendations

The main content challenge is an accurate, maintainable crop library. Build a broad vegetable and herb library using Exa, with no fixed 15–25-crop launch cap. Research should cover regional planting guidance across the US. Exa is selected using the user’s existing free credits. It is not connected as a callable tool in this session and has not been used to populate the library. See the provider decisions below for the distinction between source discovery and bulk output retention.

Proposed research workflow: discover authoritative extension and agricultural sources; extract candidate crop records; normalize units and sowing/transplant distinctions; retain field-level source URLs, retrieval dates, and regional applicability; flag conflicting or missing values; review and version published rules. Search results and extracted prose are research inputs, not automatically approved planting recommendations.

Each crop needs sowing/transplant methods, spacing, light requirements, temperature constraints, frost sensitivity, approximate maturity, and source notes. Distinguish maturity measured from sowing versus transplanting, and support variety overrides where they materially change the schedule.

University extension guidance supports using soil temperature and crop type alongside frost timing. Air-temperature forecasts should not be presented as measured bed soil temperatures. Ask the gardener to confirm soil conditions when a recommendation depends on them. [University of Minnesota planting guidance](https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/planting-the-vegetable-garden)

Create original structured rules from attributable factual guidance; assess reuse permission before importing third-party prose or entire tables. No ready-to-use, licensed crop dataset was validated in this assessment.

**Decision:** deterministic rules generate dates and spacing. Optional AI explains the result. Keep planned and actual planting dates separate, and show the reason for each weather-driven adjustment.

## 5. Forecasts and frost alerts

### Initial provider: National Weather Service

The NWS API offers forecasts, observations, and alerts without usage fees, with unpublished rate limits and an identifying User-Agent requirement. Its point lookup supplies forecast grid endpoints, including hourly forecasts over the next seven days. It supports caching; grid mappings should be refreshed periodically. [NWS API documentation](https://www.weather.gov/documentation/services-web-api)

For the US launch, retrieve forecasts by shared provider grid rather than repeatedly for each garden. Evaluate each garden's planted crops separately. Respect cache headers, retry with backoff, and record forecast issuance/fetch times.

A longer-term planting calendar remains climate-based. Pro can refine near-term actions; it cannot know the exact weather months ahead.

### Alerts need two inputs

- **Official advisories/warnings:** show source, affected area, onset, expiry, and updates.
- **Our garden recommendations:** evaluate forecast conditions against crop sensitivity and actual planting state, labeling them as application recommendations.

Official frost products are locally defined and seasonal. NWS examples include frost conditions at forecast temperatures above freezing. Therefore, “no official warning” must not mean “no garden risk,” and a single 32°F trigger is inadequate. [NWS frost/advisory criteria](https://www.weather.gov/lwx/WarningsDefined)

For initial monitoring, propose hourly checks during active monitoring, an advance heads-up for emerging risk, and updates only when risk or the recommended action changes materially. Final thresholds and timing need regional horticultural review. Deduplicate by garden and event; handle forecast revisions, alert cancellations, and stale feeds.

**Fallback candidate:** Open-Meteo has a commercial customer API. Its free endpoint is for non-commercial use; a commercial deployment needs the appropriate subscription. The published Standard allowance is one million calls/month. Confirm the current subscription quote before budgeting it. [Open-Meteo pricing and licensing](https://open-meteo.com/en/pricing)

**Unproven:** provider availability across US regions, useful alert lead time, false-positive rate, and end-to-end notification reliability. A stale feed should visibly say monitoring is delayed rather than imply that conditions are safe.

## 6. Trestle readiness

Inspected local `main` at `51bf4d6500657c240515955881eeb9f556cd5925` in `/Users/gregmushen/work/code/gstack`; no branch switch or framework changes were made.

Evidence from that revision:

- `README.md`: React/Astro/Hono/PostgreSQL foundation, authentication, tenant isolation, email, and billing adapters.
- `packages/create/template/apps/worker/src/index.ts`: real queue consumer and scheduled handler. The handler dispatches outbox work and performs artifact maintenance; it is not an existing garden-weather scheduler.
- `packages/create/template/packages/billing/src/plans.ts`: application-owned plans and entitlements that can be replaced with Free/Pro garden capabilities.
- `docs/ROADMAP.md`: remaining production/provider verification work. Roadmap status is not proof that this product will operate correctly in deployment.

**Conclusion:** Trestle supplies useful infrastructure. The garden domain, provider adapters, crop rules, forecast scheduling, and notification policy remain application work. Generate a separate app from a pinned main revision; prove a scheduled event reaches a captured email locally and a controlled test recipient in staging before selling monitoring.

## 7. Cost feasibility

### Selected geocoder: Geoapify

The free plan includes 3,000 credits per day; a standard forward-geocoding request uses one credit. Commercial use requires attribution and compliance with plan limits. The API 10 plan lists 10,000 credits per day for $59/month on monthly billing. [Geoapify pricing](https://www.geoapify.com/pricing/), [Geocoding request costs and storage](https://www.geoapify.com/geocoding-api/)

For illustration, 10,000 address submissions spread evenly across a 30-day month would average approximately 333 requests/day, within the free allowance if no other requests consume the credits. Daily spikes, autocomplete, retries, and other Geoapify services can change that calculation. Resolve addresses at setup or when changed; weather monitoring uses the saved garden coordinates.

Map tiles and aerial imagery will come from MapTiler Cloud. Budget its commercial Flex plan separately from Geoapify; see the provider decisions below.

### Google comparison only — not the selected geocoder

The following figures are retained to explain the earlier comparison, not as the selected stack's budget. Current Google global pay-as-you-go list prices, USD; rates shown per 1,000 events in the first paid tier. Free caps are monthly per SKU, subject to applicable billing-account rules. [Google pricing](https://developers.google.com/maps/billing-and-pricing/pricing)

| Service | Monthly free cap | First paid-tier rate | Implication |
|---|---:|---:|---|
| Dynamic Maps | 10,000 | $7 | Avoid mounting a map on every dashboard visit |
| Geocoding | 10,000 | $5 | Resolve addresses deliberately, not per keystroke |
| Solar Data Layers | 1,000 | $75 | Reference only; excluded under current terms |

Illustrative map costs, assuming one shared billing account with unused free caps and no other SKUs:

- **Pilot:** 1,000 monthly users × 3 map loads = 3,000 loads, plus 1,000 geocodes → $0 for these two SKUs within the listed caps.
- **Larger usage:** 10,000 monthly users × 3 loads = 30,000 loads, plus 10,000 geocodes → approximately $140/month for these two SKUs.

These are usage models, not a total operating budget. They exclude autocomplete, taxes, hosting, database, email, payment processing, support, and crop-data maintenance. No complete margin forecast is justified until usage and Pro pricing are defined.

Weather request volume deserves a separate model. For example, 1,000 distinct forecast cells × 24 checks/day × 30 days = 720,000 forecast fetches/month before retries, point lookups, or alert requests. Share cached forecasts where valid; provider limits and freshness determine the actual schedule. NWS has no API usage fee, but capacity is not unlimited.

**Economic finding:** basic map/address costs appear manageable. Content maintenance, customer acquisition, seasonal retention, and notification operations are more significant unknowns than per-address geocoding. Willingness to pay for Pro has not been tested.

## Selected providers — September 24, 2026

### Maps and aerial imagery: MapTiler Cloud with MapLibre GL JS

Select MapTiler Cloud for the basemap and aerial/satellite layer. Keep Geoapify for address search. MapLibre GL JS is the selected renderer; Terra Draw remains the drawing-component candidate pending a polygon-editing trial.

MapTiler combines multiple aerial and satellite sources. Its documentation lists 5–50 cm imagery in much of the US, with lower resolution elsewhere; that is not a guarantee for every property. Validate representative urban, rural, Alaska, and Hawaii locations at garden zoom before treating imagery quality as proven. [Satellite dataset documentation](https://docs.maptiler.com/schema-raster/satellite/)

Use Free for permitted development/evaluation and budget **Flex at $30/month** for commercial launch. Flex lists 500,000 API requests/month and $0.15 per 1,000 extra requests. MapLibre is a third-party renderer, so use request-based accounting, not MapTiler SDK session allowances. Count billable units rather than assuming one tile equals one request: some raster sizes count as multiple requests. Measure realistic pan/zoom/edit sessions and set a spending limit. [Pricing](https://www.maptiler.com/cloud/pricing/), [Request accounting](https://docs.maptiler.com/guides/account/sessions-vs-requests/), [Cloud terms](https://www.maptiler.com/terms/cloud/)

For example, 30,000 editor visits averaging 20 billable requests would consume 600,000 requests: approximately $45/month including Flex and request overage, before taxes or other usage. At 50 requests per visit, that would be approximately $180/month. These are assumptions, not measured usage; MapTiler is not automatically cheaper than Google for every interaction pattern.

Preserve required attribution and restrict browser keys to approved origins. Export staking plans as application-generated diagrams containing user garden geometry and dimensions. Do not assume the online map subscription permits customer-facing exports of the basemap or aerial imagery; MapTiler lists separate print limitations. Mapbox was considered, but MapTiler is selected for the direct MapLibre integration and one-provider basemap/imagery setup, not on an untested claim of superior imagery or lowest cost.

### Crop research: Exa using existing credits

Select **Exa**, prioritizing the user’s available credits. Use it as an editorial research tool, not a runtime dependency for every garden plan. Research common crop facts and separate regional planting guidance, then publish reviewed, versioned rules that the application can use without a web search.

Exa currently lists Search at $7 per 1,000 requests, Contents at $1 per 1,000 pages per content type, and Agent research at $0.012–$1 per run. Search/content/research charges depend on the chosen endpoint and options; confirm credit balance, expiry, and eligible products before launching jobs. Do not infer the user’s balance from the public free-tier offer. [Exa pricing](https://exa.ai/pricing)

Parallel has useful structured research with field-level evidence, but its current standard customer terms restrict reuse of outputs across end customers and database creation. That makes it unsuitable as the default for a shared crop library without different contractual rights. [Parallel research basis](https://docs.parallel.ai/task-api/guides/access-research-basis), [Parallel customer terms, §2(b)–(c)](https://parallel.ai/customer-terms)

**Remaining Exa check:** its public terms PDF contains broad copying/derivative-use restrictions in §4.2(a). Existing credits do not establish permission to bulk-retain or republish API output. The user will request confirmation from Exa; proceed on their explicit assumption that the proposed workflow is permitted while that response is pending. The selection does not assert unlimited output-reuse rights. Keep original sources and their reuse conditions central to the research process; an API subscription does not license third-party articles. [Exa published terms](https://exa.ai/assets/Exa_Labs_Terms_of_Service.pdf)

Start with a small research sample once account access is available, under the user-authorized usage assumption, checking citations, units, regional applicability, conflicting recommendations, and missing values. No Exa calls, account purchases, or paid map subscriptions were made in this assessment.

**Follow-up verification:** Exa's canonical [Terms of Service URL](https://exa.ai/terms-of-service) currently returns the same eight-page agreement, explicitly covering its API. Section 4.2(a) is therefore not merely an unrelated website policy. Public product material describes database-oriented research workflows, but no explicit exception establishing this project's shared-library retention rights was verified. Status: Exa selected; persistent output reuse remains unconfirmed, not conclusively prohibited. The user reports that Exa supplied the credits without additional terms and will ask Exa directly about permanent storage, reuse across Free/Pro customers, and retention after credits or subscription end. The user explicitly authorized proceeding on the assumption that this workflow is permitted. Treat the outstanding reply as a tracked assumption, not a blocker to planning or research once account access is available. No provider contact has been made by the assistant; permission has not been independently confirmed.

## 8. Remaining feasibility checks

These are proposed validation tasks, not completed tests or an implementation roadmap.

| Question | Smallest useful check | Pass condition |
|---|---|---|
| Can we locate and lay out real beds? | Try properties spanning representative US regions and irregular bed shapes on mobile and desktop; compare against tape measurements | Correctable garden placement and a usable dimensioned staking diagram |
| Is the climate baseline credible? | Compare locations across contrasting US climates against local extension guidance | Documented source selection and explained discrepancies; missing data fails gracefully |
| Are the initial crop rules practical? | Review the researched crop library and representative regional calendars against authoritative guidance | Traceable rules and no unexplained unsafe or impossible timing |
| Can Pro handle changing forecasts? | Replay normal, frost-risk, revised, missing, and stale forecast fixtures | Correct crop-specific action, visible rationale, no duplicate notification |
| Does delivery survive failures? | Exercise schedule → queue → recommendation → email in staging, including retries | Delivery evidence, bounded retries, observable failures, tenant isolation |
| Can shade automation add value? | First validate a candidate's permitted use; then compare several sites against observations | Acceptable rights and measured usefulness; otherwise retain manual assessment |
| Can Pro support its costs? | Measure calls/emails per active garden and test subscription interest with pilot users | A defensible operating model and evidence of willingness to pay |

## Recommendation

Proceed with feasibility validation for the core planner and Pro weather monitoring. Use Geoapify as the selected geocoder, with MapLibre GL JS and MapTiler Cloud tiles/aerial imagery. Use USDA/OSU and NOAA as climate-data sources, NWS as the initial US forecast candidate, and manual sunlight assessment. Launch across all US regions with polygon beds and aerial imagery. Build the crop library using Exa research. Keep a paid weather provider available as an evaluated alternative.

The original plan's Google Solar assumption should be considered superseded by this assessment. Automated shade, nationally validated crop timing, and dependable paid monitoring remain unproven until the checks above are completed.
