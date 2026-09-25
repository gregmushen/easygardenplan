# Phase 4 progress evidence — bed geometry

Recorded: September 25, 2026

Status: **local implementation complete; external physical-validation gate remains**. Metric geometry, immutable revisions, validation, calibration, full pointer/keyboard editing, and printing are implemented. The phase remains open for physical mobile-device and screen-reader review and a real tape-measured bed trial.

## Implemented and proved

- Local equirectangular metric projection with longitude wrapping and inverse conversion.
- Concave outer polygons, interior exclusions, area, containment, overlap and self-intersection checks.
- Immutable forced-RLS bed geometry revisions with tenant-safe compound relationships and optimistic revision checks.
- Interactive SVG points use Pointer Events for mouse, pen and touch dragging. Each drag is one undoable edit; pointer cancellation is handled.
- Explicit modes separate shape editing from view panning. Boundary and exclusion drawing accept pointer/touch vertices, show the live candidate segment length, and require an explicit close action after at least three vertices.
- Selectable edges insert midpoint vertices. Vertices can be moved or deleted, while undo/redo covers drawing, insertion, deletion and dragging. The toolbar exposes state with pressed-button semantics and the editor announces saved, saving and unsaved states.
- Every SVG point is keyboard focusable and moves in 0.1-meter arrow-key steps or 0.5-meter Shift+arrow steps. The coordinate fields remain the precise editing path.
- Coordinate editing includes add/delete vertex, add/remove exclusions, undo/redo and measured-edge scaling.
- Rotation and east/west plus north/south translation are explicit revision inputs. The interactive preview applies the transform and pointer movement is mapped back through its inverse before changing authoritative local coordinates.
- Each geometry revision records a dated manual sunlight observation with an explicit unknown state and optional observed hours.
- Dimensioned printable SVG with edge lengths, north marker and no map-provider imagery.
- Unit fixtures cover round trips, Alaska antimeridian behavior, concavity, contained exclusions, invalid bow-ties, outside exclusions and degenerate calibration.
- Worker system path proves create → revision 2 → stale revision conflict → two-entry history → dimensioned print.
- Terra Draw was evaluated against the current application stack. Its official compatibility table supports MapLibre GL JS 4/5 while this application is pinned to MapLibre 6.11.2. The project also needs a first-class coordinate-field path and application-owned metric revision semantics. The prototype therefore retained the small application-owned SVG editor instead of adding an unsupported adapter dependency. Re-evaluate after the adapter declares MapLibre 6 support.
- Local desktop Chromium path proves manual location → seasonal context → explicit pan/edit modes → keyboard edge insertion → pointer boundary drawing and explicit close → keyboard point movement → undo → real pointer drag → add exclusion → undo/redo → remove exclusion → undo → sunlight observation → transformed preview → persisted rotation/translation reload → create bed → edit a vertex → revision 2 → print link; 1 passed in 18.3 seconds.
- The same complete product journey passes in Playwright's Pixel 7 Chromium profile. It exercises the editor's touch handler to draw and explicitly close a replacement boundary at a mobile viewport, then continues through saving, planning, task history, notification preferences, billing transitions and account deletion; 1 passed in 17.1 seconds.
- Pointer cancellation releases captured pan and vertex-drag gestures, so an interrupted gesture cannot leave the editor in a dragging state.

## Remaining exit evidence

- Validate the Pointer Events interaction on supported physical mobile browsers.
- Perform the primary path with a screen reader and record labels/focus behavior.
- Inspect an actual printed page and complete one tape-measured garden trial within the declared tolerance.
