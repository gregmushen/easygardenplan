# Phase 4 progress evidence — bed geometry

Recorded: September 25, 2026

Status: **in progress**. Metric geometry, immutable revisions, validation, calibration, pointer and keyboard editing, and printing are implemented. The phase remains open for physical mobile-device and screen-reader review and a real tape-measured bed trial.

## Implemented and proved

- Local equirectangular metric projection with longitude wrapping and inverse conversion.
- Concave outer polygons, interior exclusions, area, containment, overlap and self-intersection checks.
- Immutable forced-RLS bed geometry revisions with tenant-safe compound relationships and optimistic revision checks.
- Interactive SVG points use Pointer Events for mouse, pen and touch dragging. Each drag is one undoable edit; pointer cancellation is handled.
- Every SVG point is keyboard focusable and moves in 0.1-meter arrow-key steps or 0.5-meter Shift+arrow steps. The coordinate fields remain the precise editing path.
- Coordinate editing includes add/delete vertex, exclusions, undo/redo and measured-edge scaling.
- Dimensioned printable SVG with edge lengths, north marker and no map-provider imagery.
- Unit fixtures cover round trips, Alaska antimeridian behavior, concavity, contained exclusions, invalid bow-ties, outside exclusions and degenerate calibration.
- Worker system path proves create → revision 2 → stale revision conflict → two-entry history → dimensioned print.
- Local browser path proves manual location → seasonal context → keyboard point movement → undo → real pointer drag → undo → create bed → edit a vertex → revision 2 → print link; 1 passed.

## Remaining exit evidence

- Validate the Pointer Events interaction on supported physical mobile browsers.
- Perform the primary path with a screen reader and record labels/focus behavior.
- Inspect an actual printed page and complete one tape-measured garden trial within the declared tolerance.
