# Easy Garden Plan — Garden Editor and Planning Behavior

Status: proposed application behavior and geometry contract. No editor or planning algorithm implemented. Defaults below are implementation proposals, not researched horticultural guidance.

Inputs: [03 — Architecture](03-system-architecture-and-flows.md), [06 — Implementation](06-application-implementation-spec.md), [07 — Data and rules](07-data-and-planting-rule-model.md).

## 1. Outcome

A gardener can locate their garden, represent the usable ground accurately, select crops and quantities, and understand where and when to plant. The map anchors the garden; the dimensioned diagram supplies planting measurements. The editor supports arbitrary valid simple polygons, including concave boundaries and interior exclusions, rather than restricting beds to rectangles.

The resulting plan must explain what fits, what does not, and what remains unknown. It must not imply survey accuracy from aerial imagery or silently treat every unplaced crop as impossible to fit.

## 2. Setup and navigation

Use saved steps: location → beds → conditions → crops → plan review. Users can revisit earlier steps without losing later selections. Show incomplete steps and unresolved inputs explicitly.

Location accepts a Geoapify address candidate or a manually placed pin. The user confirms the garden location and timezone. Store the pin separately from optional address text. A failed geocode must leave manual placement available.

Offer aerial and diagram views. MapTiler attribution remains visible where tiles are displayed. When imagery is unavailable or unclear, allow a measured diagram anchored to the garden pin. Existing saved geometry remains editable if tile loading fails.

The garden overview lists beds with names, usable area, conditions and save status. A bed is one connected planting area. Separate disconnected areas are separate beds. Interior holes represent paths, obstacles or other non-plantable space.

## 3. Geometry authority and coordinates

Persist each bed revision as:

- An explicit geographic anchor and local coordinate-system definition/version.
- An authoritative polygon in local metric coordinates, including exclusion rings.
- Orientation relative to true north.
- Measurement provenance and calibration state.
- Stable bed identity, revision ID and previous-revision reference.

Derive geographic display coordinates through the stored transformation. Do not maintain two independently editable authoritative polygons. Use a reviewed local projection suitable for the location and bed extent, with longitude wrapping handled explicitly. Reject or re-anchor unsupported extents rather than silently using a distorted projection. Library choice and numerical tolerances are implementation decisions validated by fixtures before adoption.

Geometry drawn over imagery initially has estimated dimensions. A measured correction calibrates the geometry and changes its revision. Display whether dimensions are imagery-derived or user-measured; entering one known distance does not make every corner independently surveyed.

### Measurement correction

For the initial editor, a user selects an edge or two vertices and enters the real distance. Preview a uniform scale around a visible fixed anchor, including the resulting dimensions and map footprint. Applying the correction scales the whole bed and its exclusions together.

Do not interpret a second distance as an invisible nonlinear warp. If it contradicts the current shape, offer to replace the scale calibration or edit vertices to represent the measured shape. Direct coordinate/dimension entry and rectangular starting shapes are conveniences, not restrictions on final shape.

Translation and rotation also update the revision. Changing the garden pin does not silently move existing beds: show a deliberate choice to relocate the geometry or keep its geographic placement. A location change invalidates dependent climate associations until refreshed.

## 4. Drawing and editing interactions

### Pointer and touch

- Start a bed, add boundary vertices, then explicitly close the polygon.
- Show the candidate segment and its length while drawing.
- Select vertices to move or delete them; select an edge to insert a vertex.
- Add an exclusion inside the bed using the same interaction pattern.
- Support undo/redo within the current editing session.
- Distinguish map pan/zoom from shape editing with an explicit mode.
- Provide accessible buttons and coordinate/distance fields as alternatives to dragging.

Touch targets must remain usable without covering the selected vertex. Avoid hover-only controls. Evaluate Terra Draw in a working desktop/mobile interaction prototype; adopt it only if these behaviors and accessible alternatives can be implemented reliably.

Keyboard users can select a bed/vertex, enter precise coordinates or distances, and invoke add/delete/undo/save actions. Screen-reader labels identify the selected object, units, validation issue and save state. Color alone does not communicate invalid geometry or conflicts.

### Validation

Validate in the browser for immediate feedback and again on the server before persistence:

- Finite coordinates and supported geographic extent.
- At least three distinct vertices with nonzero area.
- No boundary self-intersections or degenerate edges.
- Exclusions strictly inside the outer boundary, without touching or crossing it.
- Exclusions do not overlap or touch each other.
- Consistent normalized ring orientation and coordinate precision.

Highlight offending segments and keep the draft editable. Never silently delete corners, fill holes or simplify a shape to make it valid. If boundary edits cause an exclusion to leave the bed, require correction before saving.

Set operational vertex, bed-count and request-size limits only after testing. Make any limit explicit in validation and documentation; “any polygon” means arbitrary supported shape, not unlimited computational input. Do not silently truncate vertices.

## 5. Saving, concurrency and revision effects

Provide an explicit Save action with visible saved/unsaved/saving/error states. Preserve unsaved work in the current session after validation or network errors. Any optional device-local recovery must be scoped to the signed-in account and cleared on sign-out; do not expose exact home geometry through a shared-browser draft.

Save with an expected revision. On conflict, retain the local draft and show that a newer saved version exists. Offer reload or a deliberate reapplication to the latest version; never silently overwrite or pretend an automatic merge is safe.

Geometry changes mark dependent proposals stale. Existing active plans remain readable against their original geometry revision. To use the new shape, generate and review a new proposal.

If actual plantings fall outside newly edited ground, flag them for reconciliation. Do not move, delete or pretend to replant them. A gardener may correct a recorded position through a separate explicit progress action.

## 6. Conditions and crop selection

Record sunlight as gardener observations with an optional duration range and notes. Keep unknown distinct from shade. Manual assessment is the initial product behavior; automated shade estimation is out of scope.

For each crop selection collect crop/optional variety, growing method, desired retained-plant count and optional preferred bed. Explain that seed sowing/thinning instructions may differ from final plant count. Row/area quantities remain unsupported until a dedicated representation exists, as specified in 07.

Crop selection shows relevant published guidance and missing requirements. Unsupported combinations remain visible with reasons. Do not block browsing because one crop lacks sufficient local guidance.

Bed preference is soft by default: the review can show placement in another suitable bed and explain it. Provide an explicit “only this bed” constraint when the user intends a hard restriction. User-pinned positions are hard constraints until released.

## 7. Initial placement algorithm

Implement a deterministic, bounded heuristic rather than promising globally optimal packing. Record the algorithm version, candidate-grid policy, numerical tolerances and inputs with every proposal.

### Constraints

- Use published spacing rules for the chosen crop and method.
- Treat occupied actual plantings and user-pinned placements as fixed obstacles with their applicable spacing model.
- Keep each required spacing footprint within usable ground and outside exclusions.
- Respect hard bed restrictions and known incompatible conditions.
- Do not use companion-planting claims or automatic shade predictions without separately reviewed rules and an explicit feature design.

The initial model reserves proposed positions for the planned occupancy interval. Where occupancy timing is uncertain, reserve conservatively for the plan rather than assume a harvest/removal date. Automated succession reuse is deferred; actual removal or a revised plan can release space explicitly.

### Spacing interpretation

Convert supported rule patterns to explicit geometric footprints:

- For a symmetric center-spacing model, a circular footprint uses half the required spacing as its radius; pairwise non-overlap gives the corresponding center separation.
- For supported row-spacing rules, use oriented rectangular cells based on within-row and between-row spacing.
- Mixed-pattern compatibility must have a defined conservative geometric test. If unsupported, keep those crops in separate placement groups or report the constraint; never invent a horticultural compatibility rule.

These are placement conventions, not new horticultural facts. Explain edge clearance and the resulting conservative capacity. Any cultivation pattern requiring a different model stays unsupported until modeled and tested.

### Search sequence

1. Validate saved geometry and resolve applicable rules.
2. Load existing occupancy and validate pinned proposed positions.
3. Process user priority, then deterministic constraint/footprint ordering with stable ID tie-breakers.
4. Search eligible beds in a stable preference order using deterministic candidate positions and supported orientations.
5. Check containment, exclusions, pairwise clearance and hard restrictions for every accepted position.
6. Stop at a bounded effort budget and retain explicit reasons for unplaced quantities.

Represent distinct outcomes: missing rule, incompatible conditions, pinned conflict, insufficient space under the chosen model, and heuristic search limit. If the engine has not proved infeasibility, say “could not place with this layout,” not “cannot fit.”

Do not insert an invented universal walkway allowance. Users draw access paths as exclusions. The editor may flag reach/access considerations, but numerical access thresholds require a declared design choice or reviewed guidance. Support/trellis placement is shown as instructions and user constraints initially; automatic shadow and structural planning are deferred.

## 8. Manual adjustment and regeneration

Users can move a proposed plant, change bed preference, adjust requested quantity, or pin/release a position. Validate each move using the same server rules as generated placements. Invalid placements remain a visible draft preview and cannot become a valid saved plan item.

Manual placement does not bypass spacing or exclusion constraints. If users choose a different cultivation pattern, it must have a supported rule/model; an unvalidated override must not be presented as a verified layout.

Regeneration preserves explicit pins where still valid and explains conflicts rather than silently moving them. Track placement identities so unchanged items remain recognizable. Changing priorities can change the layout, but does not mutate the active plan until acceptance.

## 9. Plan review and activation

Review has three connected views: bed diagram, crop allocation summary and seasonal calendar.

For every requested crop show requested/placed/unplaced counts, bed assignments, method, date windows, missing prerequisites and evidence-backed explanation links. Show unknown scheduling separately from unknown placement. Link each calendar task to its affected crop/bed and explain whether it is a baseline window or a later weather adjustment.

A proposal generated asynchronously displays pending/failed/ready state and its input revision. If inputs change while generation runs, keep the result available for comparison but mark it stale; it cannot automatically replace the current plan.

Activation checks the current garden/bed/selection revisions and expected active-plan revision atomically. Require regeneration or an explicit validated reconciliation when they differ. Generate tasks from the accepted snapshot and record any acknowledged unresolved items. Unresolved items receive no fabricated dates or positions.

A replacement plan preserves actual plantings and completed/skipped history. Present the proposed changes to future tasks before acceptance. An ordinary bed edit or crop-rule publication never silently activates a new plan.

## 10. Staking diagram and print behavior

Generate a standalone diagram from app-owned geometry and placements, without basemap imagery. Include bed name, orientation, units, key dimensions, exclusions, labeled plant positions, crop legend, spacing references, plan/version date and unresolved-item summary where relevant.

Use a clear reference origin and coordinate offsets or dimension chains so the user can stake positions using a tape measure. Avoid chains that accumulate unexplained rounding error. Show measurements from the persisted metric geometry, converted consistently to the selected display units.

A fit-to-page print is labeled as such; users follow printed dimensions rather than measuring paper. If true-scale printing is later supported, include a calibration mark and explicit print settings. Do not imply printer scaling is controlled by the application.

Offer a printable browser view initially. PDF generation/storage can be added when needed without changing the geometry contract. The diagram remains usable when tile providers or live weather are unavailable.

## 11. Acceptance scenarios

- Draw, measure, save and reload rectangular, concave and excluded-area beds on desktop and touch devices.
- Reject bow-ties, duplicate/degenerate vertices, crossing/touching exclusions and unsupported coordinate extents with actionable feedback.
- Validate geographic/local round trips, orientation, manual scale corrections and Alaska longitude-wrap fixtures.
- Preserve drafts on failed saves and prevent stale revisions from overwriting new geometry.
- Keep existing planting positions when a revised boundary conflicts with them.
- Verify each generated and manual placement's complete footprint, not just its center.
- Demonstrate deterministic mixed-crop placement, hard/soft bed preferences, pins and bounded-search failure reporting.
- Confirm requested quantities never disappear; partial plans identify placement versus scheduling gaps.
- Prevent stale proposals and concurrent activation from replacing the wrong plan.
- Verify readable printouts with exclusions, orientation and consistent dimensions in both supported display-unit systems.
- Exercise keyboard-only setup and editing alternatives, clear focus states and non-color error cues.

Geometry/unit tests prove mathematical invariants. Browser tests cover meaningful interaction flows. A real measured-bed trial checks usability and map-to-diagram calibration; it does not certify the map as survey data.
