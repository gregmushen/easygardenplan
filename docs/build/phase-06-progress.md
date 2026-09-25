# Phase 6 progress evidence — calendar and actual progress

Recorded: September 25, 2026

Status: **in progress**. The complete deterministic local path, customer correction flow and geometry reconciliation are implemented and verified. The phase remains open for physical screen-reader review and validation against the real reviewed catalog and climate data tracked in phases 2 and 3.

## Implemented and proved

- Plan activation atomically creates immutable garden-local task definitions and initial append-only status revisions from the frozen plan schedule.
- The garden screen includes This Week and full-calendar views with planned windows and crop/method context.
- Complete, postpone and skip commands use expected revisions; stale and terminal-state transitions are rejected.
- Sowing, emergence, transplant, harvest, removal and correction are distinct append-only progress event types. Correction events reference the event they supersede rather than rewriting history.
- An actual sowing event recalculates a derived harvest window from the matching maturity anchor in the plan's frozen rule snapshot. Missing matching anchors remain absent instead of receiving an invented estimate.
- Plan tasks, status revisions and progress events use forced tenant RLS and tenant-safe relationships.
- Replacing the active plan leaves the original plan, its tasks and recorded actual events separately queryable.
- Garden history offers a correction action that records a new dated event pointing to the original. The UI explains that the original remains visible; it never edits history in place.
- Progress positions are rechecked against the current immutable bed revision when history is loaded. A moved outline produces an explicit reconciliation warning and correction action while preserving the original position and bed revision history.
- The staking-plan SVG renders from persisted application geometry with bed outlines, crop placements, dimensions, north orientation, a crop legend and unresolved notes. It contains no provider imagery.
- PostgreSQL integration coverage proves revision rejection, maturity recalculation and history preservation across a replacement plan.
- The local browser path proves active plan → calendar → record actual sowing → derived maturity task → complete/postpone/skip; 1 passed.
- The same browser path runs the WCAG A/AA scan after calendar and history interactions, retrieves the authenticated staking diagram, verifies its image semantics and rejects embedded provider imagery. It runs while the external map provider is unavailable, proving the persisted calendar and application-owned print path do not depend on map availability.

## Remaining exit evidence

- Complete a physical screen-reader review for calendar and print paths; automated keyboard, WCAG A/AA and provider-failure coverage is complete.
- Validate task instructions and maturity anchors against the real reviewed crop catalog and nationwide climate matrix.
