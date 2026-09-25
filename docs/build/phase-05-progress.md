# Phase 5 progress evidence — deterministic planning

Recorded: September 25, 2026

Status: **in progress**. The complete synthetic product path and explicit reviewed override relationships are implemented and verified. The phase remains open because nationwide completion still depends on the real reviewed crop catalog and climate datasets tracked in phases 2 and 3, plus representative real-world horticultural validation.

## Implemented and proved

- Tenant-safe crop selections include an optional published variety, method, retained-plant quantity, priority, soft/only bed preference and optimistic revisions. The variety picker appears only when the selected crop has reviewed published varieties.
- Immutable plan versions freeze the garden revision, bed geometry revisions, selection revisions, climate association, catalog release, season year, timezone and algorithm version.
- The deterministic `grid-v1` planner uses full spacing footprints, polygon containment, exclusions, pairwise clearance, stable ordering and a bounded effort budget.
- Missing and conflicting spacing/window rules remain explicit. Requested quantity always equals placed plus unplaced quantity, and heuristic exhaustion has a distinct reason from missing constraints.
- Published rules can carry explicit reviewed override relationships to prior published rules for the same crop, rule type and growing method. Those relationships become immutable at publication.
- Frozen plan inputs now include normalized garden region identifiers, and the planner selects a scoped rule only when its recorded region intersects that frozen context. Mismatches remain explicit in the rule-selection trace.
- Rule resolution removes only explicitly overridden applicable candidates. Every spacing and planting-window decision persists a trace identifying selected, overridden, inapplicable and unresolved conflicting candidates, and the proposal UI exposes that trace.
- Local-calendar evaluation covers multiple windows, cross-year ranges, explicit leap-day clamping, frost-relative offsets and missing anchors without using elapsed 24-hour arithmetic.
- Proposal activation is serialized, re-verifies the current frozen inputs, persists stale results as stale, permits only one active plan per garden and requires every unresolved limitation to be acknowledged.
- Manual movement creates a new immutable proposal and validates the pinned footprint against the same bed, exclusion and collision rules.
- PostgreSQL coverage proves repeated deterministic generation, duplicate activation serialization, stale selection detection and persisted stale state.
- The local browser path proves crop choice → quantity and bed preference → proposal → placed/unplaced review → seasonal window → pinned adjustment → activation; 1 passed.
- The full repository check passed: type checks, unit/integration tests, production builds and the Worker dry run.

## Remaining exit evidence

- Publish and validate a real reviewed catalog with launch crop/method/region coverage after Exa access and source review are available.
- Validate the representative nationwide matrix against real climate imports and reviewed horticultural cases.
- Phase 6 owns creation of executable future tasks from an activated plan; activation is already atomic and immutable.
