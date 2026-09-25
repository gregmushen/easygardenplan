# Real climate import evidence

Recorded: September 25, 2026

Status: **passed locally with official releases**.

## NOAA frost normals

Source: NOAA NCEI U.S. Climate Normals 1991–2020, annual/seasonal multivariate by-station archive, version 1.0.1. The normalizer selects the P50 32°F `PRBLST` spring-last-freeze and `PRBFST` autumn-first-freeze fields. A station is labeled frost-free only when the 32°F occurrence probability is explicitly zero. Missing, flagged, partial or otherwise ambiguous rows are omitted.

- Source archive SHA-256: `0fdb814203150780d4ee0c5d53c7844a237a21881101fb7d922b0aa3a1fd190f`
- Deterministic extracted-files SHA-256: `576a08c33eaf5298cecd8e2ce096ab896fb017770b884eceb5dda6ae597f01cb`
- Normalized manifest SHA-256: `40442040e25e22b1f34d88120cfe2f3b6151ae05ddc2efe636880b99f2de96b5`
- Accepted: 7,083 stations: 6,949 with known dates and 134 explicitly frost-free.
- Omitted: 8,533 stations without a complete supported P50 32°F interpretation.
- Local published dataset ID: `11d0d2c1-2b92-4da5-9f8a-15e338763409`.

## USDA/OSU hardiness

Source: the four 2023 USDA Plant Hardiness Zone Map grids published by Oregon State University PRISM for CONUS, Alaska, Hawaii and Puerto Rico. The normalizer uses nearest-neighbor GDAL sampling at 16.666667% of the original width and height, converts the mean annual extreme minimum Fahrenheit value into the official five-degree half-zone bands, wraps Alaska across the antimeridian, and labels the result as an approximate transformed point sample rather than the official map.

| Region | Archive SHA-256 | Normalized sample SHA-256 |
|---|---|---|
| CONUS | `7834bb8f93e5b62c1e09374ba65afa7c91d638a0456ea241f668d7023cc4b785` | `4686d56cfd0081fadc186685a70f8fd11946dd70144309e8ca7172ba26a643c8` |
| Alaska | `9a599d3a360991ebc94a5c6561a82570a1def068f873bd5e0964282fb2f7f2b6` | `1bbd006eaada5f34fa988d046fbff5159f5aca3edeca17f0d10520ff20b05027` |
| Hawaii | `0e88f66779923e79a9ca83531db3ea36213f933f85ba5d68b150ddad661819da` | `7657131b3b363dc1137577057a5be1070706f0065f0f9b3bfff7f6a401e4f56f` |
| Puerto Rico | `c86e41d7e0a4d94fd5081f852980fae8c42e0bc55b30e5e046703cdfe67c07c3` | `d1700ee235bb5ed378257828c3cb7e99fb3c85c0f8820bf108f6cc9b4be86b29` |

- Normalized manifest SHA-256: `0d321b9fa4cf69d998f5f37e18bca02f15e66c0ea9f0cdf06a14bc023c6796e3`.
- Accepted: 460,718 land samples covering zones 1a through 13b: CONUS 335,903; Alaska 120,948; Hawaii 2,573; Puerto Rico 1,294.
- Local published dataset ID: `fef2948f-6c82-4ffd-8bf9-6d23a6825f81`.

## Representative validation

The repeatable `pnpm validation:climate` matrix created temporary gardens, resolved both current datasets, asserted that both source kinds were retained, and removed all temporary household data. All matches completed in 8.1–35.2 ms locally.

| Location | Zone | Frost state | Spring / autumn P50 anchors | Hardiness / frost distance |
|---|---:|---|---|---:|
| Minneapolis, MN | 5a | known | 04-23 / 10-16 | 2.3 / 1.4 km |
| Seattle, WA | 9a | known | 03-13 / 11-17 | 1.0 / 8.8 km |
| Dallas, TX | 8b | known | 03-02 / 11-29 | 2.9 / 10.0 km |
| Phoenix, AZ | 10a | known | 01-05 / 01-03 | 1.2 / 6.9 km |
| Aspen, CO | 5b | known | 06-02 / 09-23 | 1.8 / 1.9 km |
| Miami, FL | 11a | frost-free | — | 3.3 / 10.4 km |
| Anchorage, AK | 5b | known | 05-01 / 09-29 | 0.8 / 2.4 km |
| Honolulu, HI | 12b | frost-free | — | 0.7 / 6.0 km |
| San Juan, PR | 13b | frost-free | — | 1.1 / 7.3 km |

These are typical climate anchors, not forecasts or planting guarantees. The hardiness layer is intentionally coarser than the source grid and must retain its transformed-data disclaimer. The product presents the frozen NOAA and USDA/OSU attributions with each association and still permits a gardener to replace typical anchors with observed dates.
