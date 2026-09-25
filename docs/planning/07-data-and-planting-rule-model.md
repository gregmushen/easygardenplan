# Easy Garden Plan — Data and Planting-Rule Model

Status: proposed application contract; no crop guidance has been researched or published by this document. Numeric examples are schema illustrations, not horticultural recommendations.

Inputs: [03 — Architecture](03-system-architecture-and-flows.md), [06 — Application implementation](06-application-implementation-spec.md). Detailed geometry and notification policy follow in 08 and 09.

## 1. Purpose

Turn reviewed research into reproducible, explainable layouts and seasonal schedules across all US regions. Keep plant identity, evidence, published rules, climate context, and private garden activity separate.

The planner consumes immutable published versions. It does not browse, ask Exa, or infer missing horticultural facts while generating a customer plan. Identical versioned inputs and algorithm versions must produce identical outputs.

All US regions remain in scope, including Alaska and Hawaii. Nationwide support means representing frost-free, heat-limited, multiple-season and cross-year cases correctly. A hardiness-zone match alone is insufficient evidence for an annual crop's planting dates.

## 2. Identity and taxonomy

### Crop identity

`Crop` is a stable product identity with an immutable ID, canonical common name, searchable aliases, scientific-name references where established, and an editorial lifecycle. Names and slugs may change without breaking existing plans.

A crop is the level at which the user makes a meaningful planning choice. Split identities when harvested part or growth habit materially changes relevant instructions; do not collapse every plant with a shared species name into identical guidance. Record taxonomy as referenced data rather than relying on a common name as a key.

`Variety` optionally refines a crop. A variety's properties override a general rule only where evidence explicitly supports that override. Choosing an unknown variety must not fabricate variety-specific spacing, maturity or temperature tolerances.

`GrowingMethod` initially distinguishes direct sowing, indoor seed starting followed by transplanting, and transplanting purchased starts. Other methods may be added explicitly. A rule declares which methods it supports; the engine cannot substitute direct-sow dates for transplant dates.

The crop picker supports search and aliases. Catalog breadth is not limited to a fixed number of crops. Editorial coverage status may differ by crop, method and location.

## 3. Evidence model

| Record | Required content |
|---|---|
| Source | Stable ID, URL, title, publisher, source type, publication/update date if known, access date, attribution/reuse notes |
| Evidence item | Source ID, relevant locator or permitted excerpt, normalized factual claim, geographic/method/variety scope, original units, retrieval run |
| Research run | Brief, crop/method/geographic target, provider/run identity where available, request fingerprint, status, attempt history, usage/cost metadata |
| Review decision | Reviewer identity, time, evidence considered, accepted/rejected interpretation, conflict rationale |

Discovery rank and an AI confidence score are not publication authority. Prefer relevant primary horticultural guidance, such as regional extension publications, and preserve its scope. A general reference can support general facts without being sufficient for a local calendar.

Exa supplies candidate sources and draft extraction. Validate extracted claims against source content before approval. Source text is untrusted input, never instructions for tools or publication. Avoid retaining full copyrighted source text unless permitted; retain normalized facts, citation metadata and permitted supporting evidence.

Do not send private garden addresses or customer records to research providers. Research targets crops and geographic/climate classes. The existing user-authorized Exa reuse assumption remains in effect; account access and usage budgets are execution prerequisites.

## 4. Typed rule contracts

A `RuleVersion` contains:

- Stable rule-family ID and immutable version ID.
- Crop ID, optional variety ID, supported method and cultivation context.
- A typed applicability predicate and rule payload.
- Required evidence references and review decision.
- Draft/review/published/withdrawn status, publication time and optional replacement reference.
- A schema version, explicit units, and machine-readable explanation/reason codes.

A published payload is immutable. Corrections produce a new version. Withdrawal marks a rule unavailable to new plans without erasing historical evidence. Editorial changes to publication state are audited.

### Initial rule types

| Type | Payload semantics | Missing-data behavior |
|---|---|---|
| Spacing | Within-row distance, between-row distance or supported spacing pattern; method/stage context | Do not auto-place without a supported spacing model |
| Light | Supported exposure range/category and any explicit limitations | Show unknown fit when garden observations are missing |
| Planting window | One or more seasonal windows expressed through supported date expressions | Keep unscheduled with a reason if required anchors are unavailable |
| Seed-start lead time | Range before an applicable transplant window | Applies only to the indoor-start method |
| Maturity estimate | Duration range plus anchor: sowing, emergence or transplant | Do not use a transplant-based duration from sowing date |
| Environmental prerequisite | Typed condition such as measured soil-temperature range | Present as a condition; do not infer soil temperature from air forecast |
| Support requirement | Reviewed staking/trellis guidance, including relevant stage | Inform instructions; structural design remains outside scope |
| Cold/heat response | Stage-specific threshold/range, exposure requirements and supported action | No crop-specific risk conclusion without sufficient inputs |
| Instruction | Reviewed action text tied to crop/method/stage and references | Avoid generating unsupported instructions from missing rules |

Separate establishment spacing from seed sowing/thinning instructions. Initial layout positions represent intended retained plants, not individual seeds. Store desired quantity as retained plants; separately explain seed rates or thinning when supported. For crops unsuitable for individual-position planning, mark that representation unsupported until a row/area model is implemented rather than inventing a plant count.

Rule values use discriminated typed objects and declarative predicates. Do not store executable JavaScript, arbitrary SQL, or provider-generated expressions as rules.

## 5. Units, ranges and unknown values

Persist distance in meters, temperature in Celsius, and durations in integer calendar days, with source units retained in evidence. Decimal precision and rounding are explicit in contracts; display rounding must not change fit calculations. User units affect presentation, not stored physical meaning.

Ranges retain lower and upper bounds. Do not reduce a range to its midpoint and present it as an exact recommendation. Each endpoint's inclusivity is defined by the rule schema.

Distinguish:

- `known`: supported value or range.
- `not_applicable`: the concept does not apply, such as an absent frost anchor in a frost-free regime.
- `unknown`: evidence or required input is unavailable.
- `conflicted`: applicable reviewed evidence is unresolved.

Null alone cannot represent all four. Zero is a real value, never a missing-data sentinel. Confidence uses reviewed categorical rationale, not a fabricated numeric probability.

## 6. Regional applicability and rule selection

Applicability may constrain geographic scope, climate regime, elevation range, variety, growing method, indoor/outdoor context, or stage. Every condition is typed and evaluated against known inputs. Unknown required conditions produce an unresolved match rather than automatically matching.

Geographic regions are versioned definitions with stable IDs and geometry or explicit memberships. Postal addresses and state names alone are not climate models. Zone, elevation and region are distinct attributes.

Resolve rules independently by rule type:

1. Select published versions active in the chosen catalog release.
2. Filter by crop and supported method/context.
3. Evaluate applicability predicates and record rejected/unknown reasons.
4. Apply explicit reviewed supersession/override relationships within applicable rules.
5. If multiple candidates remain, use a reviewed precedence declaration where one exists.
6. Otherwise report an unresolved conflict; do not choose by latest retrieval date, model confidence, or publication recency alone.

A narrower geography or variety is not automatically superior. It can override a general rule only with an explicit editorial relationship and compatible context. A fallback is allowed only when reviewed and declared; it must not erase a known local constraint. Keep selected rule IDs and the selection trace with the plan.

## 7. Climate profiles and date expressions

A published `ClimateDatasetVersion` identifies the source release, normalization version, coverage and attribution. A garden's `ClimateAssociation` records the matched station/grid/region, distance or matching rationale, relevant elevation context, uncertainty and association version.

Separate hardiness zone from historical frost/freeze statistics. A frost statistic includes the temperature threshold, probability/percentile convention, season and reference period. Never combine dates from different conventions without an explicit normalization rule.

If location matching is weak or unavailable, expose the uncertainty and permit a clearly labeled gardener-supplied seasonal anchor. Store its provenance as user input; never relabel it NOAA data. Manual anchors remain attached to the plan snapshot.

### Supported date expressions

- Offset range from a named, fully qualified historical spring or autumn anchor.
- Explicit recurring local-calendar window for a defined applicable region.
- Relative duration from an actual planting-stage event.
- Reviewed combination/intersection of supported windows and prerequisites.

A calendar window stores both month/day endpoints and an explicit end-year offset. A November-to-February window crosses the year boundary deliberately. Define leap-day handling in the evaluator and test it; never rely on a runtime's silent date rollover.

One crop may have several windows in a year. An empty intersection means no feasible window, not an instruction to pick the nearest day. Missing frost anchors do not prevent using an independently supported frost-free regional calendar.

Seasonal schedules use local calendar dates in the garden's IANA timezone. Provider issuance/retrieval, audit and job execution use UTC instants. Calendar-day arithmetic must not add fixed 24-hour milliseconds across daylight-saving transitions.

## 8. Planner input and output contracts

`PlanInputSnapshot` freezes garden revision, bed revisions, selected crop/method/quantities, known actual plantings, climate association, user-provided anchors, catalog release and planning-algorithm version.

`PlanResult` contains:

- Requested, placed and unplaced quantities per selection.
- Placement coordinates and spacing-rule references.
- Seasonal windows and task dependencies with their anchor semantics.
- Required conditions the gardener must verify.
- Selected rule versions, evidence links and explanation codes.
- Unresolved constraints and their effect on placement or scheduling.

Support partial proposals: a crop may have a valid layout but unresolved dates, or a valid schedule but insufficient space. Show that distinction. Activation may preserve explicitly acknowledged unresolved items, but must never turn them into dated tasks or claim a complete plan. Persist the acknowledged limitations.

Generation first resolves knowledge and climate, then computes candidate windows and placement constraints, then produces the proposal. Placement strategy belongs in 08. Live weather may propose later adjustments, but does not rewrite the immutable seasonal result.

## 9. Actual progress and recalculation

Record actual sowing, emergence where known, transplanting, harvest and removal as distinct events. Corrections append an auditable correction/supersession rather than silently altering plan history.

A maturity estimate uses the matching actual event when available. If its anchor is unknown, show an estimate only when a reviewed fallback exists and label it. Never substitute an assumed emergence date as an observed fact.

Changing geometry, crop selections or published knowledge creates a new proposal. Existing actual plantings remain where recorded until the user explicitly changes them. A critical rule withdrawal can invalidate affected recommendations and prompt review; it cannot silently rewrite the gardener's historical actions.

## 10. Publication and coverage workflow

Draft extraction → schema/unit checks → applicability checks → evidence review → conflict resolution → publication into an immutable catalog release.

Publication requires all payload-specific mandatory fields, at least one supporting evidence reference, review attribution, and resolvable applicability. Drafts may be incomplete. Publishing a new release is atomic: consumers never see half of an import.

Maintain a coverage matrix by crop, method, region/climate regime and rule type. Report supported, partial, missing and conflicted coverage separately. Breadth should be measured through this matrix, not just a crop count.

Representative launch validation includes cold continental, cool maritime, hot summer, arid, high elevation, frost-free, Alaska and Hawaii settings. Also test region boundaries, weak station matches, multiple windows and cross-year calendars. These are test categories, not substitutes for source-supported regional coverage.

## 11. Persistence and access

Use relational identities and typed columns for crop/version relationships, lifecycle, scope keys and publication state. Typed JSON may hold versioned rule payloads and immutable calculation snapshots, validated at all write boundaries. Do not make unvalidated JSON the only model.

Publicly consumable published facts are accessed through explicit read repositories. Draft research, editorial notes and source artifacts require editorial authority. Household ownership never grants publication privileges. User-provided conditions and anchors remain private tenant data.

Private plan references to shared immutable versions do not require fake tenant ownership of those versions. Private-to-private references remain tenant-safe. Preserve historical version records when retiring catalog entries; account deletion removes private associations according to the application's deletion workflow.

## 12. Acceptance criteria

- A published fact can be traced to reviewed evidence and its applicable scope.
- An ordinary gardener cannot read drafts or publish rules.
- Same names/aliases cannot accidentally merge distinct crop identities.
- Variety and regional overrides require explicit reviewed precedence.
- Conflicting rules remain unresolved instead of producing a plausible invented answer.
- Unit conversion round trips preserve calculation precision within declared tolerances.
- Frost-free, unavailable and estimated climate states remain distinct.
- Multiple-season, cross-year, leap-day and daylight-saving cases produce defined calendar behavior.
- Plans retain the exact rule, climate and algorithm versions used after new publication.
- Actual planting events drive the correct maturity anchor and survive replanning.
- Partial results show exactly which quantities/windows remain unresolved.
- The same complete input snapshot produces the same normalized result.

Use synthetic fixtures to test engine behavior and separately reviewed real-world cases to validate horticultural outcomes. Passing synthetic tests does not establish that the crop library is accurate or geographically complete.
