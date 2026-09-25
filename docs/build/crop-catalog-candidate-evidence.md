# Crop catalog candidate evidence

Recorded: September 25, 2026

Status: **source normalization and draft import passed; editorial review remains**.

The source normalizer ingested Table 2 of Clemson Cooperative Extension's [Planning a Garden](https://hgic.clemson.edu/factsheet/planning-a-garden/) page. The retrieved source has SHA-256 `ef906adc814cc3b8d9ad94492b40fc0a396fc4fda9b67316ab0c81e5822f548f`.

The committed candidate artifact contains 39 vegetables and 77 source facts: 39 spacing rules and 38 day-to-harvest rules. The asparagus maturity value is retained as an explicit omission because the source reports years and the current maturity contract represents calendar days. Transplant-marked rows expand into separate indoor-start and purchased-start draft families, producing 87 reviewable drafts.

Every fact retains the source URL, publisher, access time, content checksum, Table 2 locator, original units, normalized claim and `us-sc` scope. Inches are deterministically converted to meters. No South Carolina fact is widened to national scope.

`knowledge:import-candidates` created 39 draft crops and 87 draft rules in the local database. A second import of the same normalization context created zero duplicates and skipped all 87 families. A new normalization version or source checksum creates a separate context for review rather than silently changing prior facts.

The implementation also closed the regional-matching gap found during this import. Geoapify state codes are normalized to region identifiers such as `us-sc`, saved with the garden, frozen in every plan input, and matched against published rule scope. Tests prove a South Carolina rule is selected for `us-sc` and rejected with an explicit trace for `us-wa` or missing region context.

These records remain drafts. They are not public advice until a catalog editor inspects the evidence, records an accepted review decision, and publishes an immutable release. Other US regions, herbs, planting windows, climate responses and source corroboration still require research and review.
