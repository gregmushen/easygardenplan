# Climate source and provenance review

Recorded: September 25, 2026

## Selected source releases

The hardiness source is the 2023 USDA Plant Hardiness Zone Map GIS release produced by Oregon State University's PRISM Climate Group. It represents 1991–2020 mean annual extreme minimum temperature, with 800 m effective resolution for the contiguous United States and Alaska and 400 m for Hawaii and Puerto Rico. OSU publishes separate grids, half-zone shapefiles, KML and ZIP-code tables for those areas. The application should normalize the shapefiles or grids for coordinate matching; ZIP-code tables are useful for audit, not precise garden placement. [USDA map creation](https://planthardiness.ars.usda.gov/pages/map-creation), [OSU/PRISM 2023 GIS downloads and terms](https://prism.oregonstate.edu/phzm/)

The frost-normal source is NOAA NCEI's current 1991–2020 U.S. Climate Normals release, version 1.0.1. NOAA provides station products for roughly 15,000 locations and recommends the current 30-year release unless an older period is required. Frost/freeze dates are station-derived normals rather than hardiness-zone facts and must retain their probability/threshold meaning. [NOAA U.S. Climate Normals](https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals), [annual/seasonal bulk files](https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/)

## Rights and attribution

OSU retains ownership of the hardiness GIS data. Its published terms allow reproduction and redistribution, but maps derived without alteration must prominently display USDA-ARS and OSU logos. Altered maps require a prominent statement that they are not the official USDA map and removal of those logos. Easy Garden Plan does not render or export a derived hardiness map in the launch scope. It stores the matched half-zone as climate context and must display USDA/OSU source attribution with the result. Any later zone-map feature needs a separate visual and terms review.

NOAA source name, release, reference period and station/record identity must remain attached to every normalized frost record and every garden association. Typical frost dates are probabilistic climate normals, not a forecast or guarantee; product copy must continue to let gardeners replace them with their own observed anchors.

## Application decision

Hardiness and frost normals remain separately versioned datasets. Publishing one must never replace the other. A garden association selects the nearest usable record from the current release of each kind, freezes both dataset/record identities, source names, releases, attribution, distance, elevation difference and match confidence, and then combines the zone with the frost state/dates.

The synthetic combined fixture is used only when neither real source kind is published. Once either real kind exists, missing counterparts remain explicitly unavailable instead of falling back to synthetic facts. Distance thresholds apply independently, so a reliable zone can coexist with uncertain frost dates or vice versa.

Migration `0054_tricky_sentinel.sql` adds the frozen multi-source evidence to existing associations without changing their historical climate values. PostgreSQL integration proves a USDA/OSU-style hardiness record and a NOAA-style frost record combine into one association while retaining both attributions.

## Remaining controlled import work

- Download the declared OSU shapefile/grid archives, retain the original files outside the application database, record their checksums and normalize point-match records for CONUS, Alaska, Hawaii and Puerto Rico.
- Download the NOAA annual/seasonal normals and documentation, select the exact frost/freeze probability and temperature-threshold fields, retain station coordinates/elevation and reject missing or invalid dates explicitly.
- Publish each normalized manifest through the checksum-verified importer, record accepted/rejected totals and run the representative-location matrix.
- Review the customer-facing attribution presentation with the exact imported releases before launch.
