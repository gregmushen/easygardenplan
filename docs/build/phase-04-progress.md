# Phase 4 progress evidence — bed geometry

Recorded: September 25, 2026

Status: **in progress**. Metric geometry, immutable revisions, validation, calibration, accessible editing and printing are implemented. The phase remains open for the dedicated touch interaction prototype, screen-reader review and a real tape-measured bed trial.

## Implemented and proved

- Local equirectangular metric projection with longitude wrapping and inverse conversion.
- Concave outer polygons, interior exclusions, area, containment, overlap and self-intersection checks.
- Immutable forced-RLS bed geometry revisions with tenant-safe compound relationships and optimistic revision checks.
- Keyboard-accessible coordinate editor with add/delete vertex, exclusions, undo/redo, measured-edge scaling and an SVG preview.
- Dimensioned printable SVG with edge lengths, north marker and no map-provider imagery.
- Unit fixtures cover round trips, Alaska antimeridian behavior, concavity, contained exclusions, invalid bow-ties, outside exclusions and degenerate calibration.
- Worker system path proves create → revision 2 → stale revision conflict → two-entry history → dimensioned print.
- Local browser path proves manual location → seasonal context → create bed → edit a vertex → revision 2 → print link; 1 passed.

## Remaining exit evidence

- Complete and record pointer/touch map drawing and measured-correction interaction on supported desktop and mobile browsers.
- Perform the primary path with a screen reader and record labels/focus behavior.
- Inspect an actual printed page and complete one tape-measured garden trial within the declared tolerance.

