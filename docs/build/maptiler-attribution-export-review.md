# MapTiler attribution and export review

Reviewed: September 25, 2026

Status: **application policy complete; live paid-plan visual check remains**.

## Provider requirements reviewed

- MapTiler's attribution guide requires MapTiler and OpenStreetMap text attribution on every map. Dynamic maps require linked text. Static images and printed maps require text on or next to the image. Free accounts additionally require the MapTiler logo. Source: [Map attribution and how to add it](https://docs.maptiler.com/guides/map-design/attribution/add-attribution/).
- MapTiler Cloud's terms allow map display to end users and limited internal prints under the selected subscription. Exporting map content outside the service and using screenshots or other static images in place of the APIs requires a custom agreement. Free-plan use is limited to noncommercial work and research and development for commercial products. Source: [MapTiler Cloud Terms and Conditions](https://www.maptiler.com/terms/cloud/).
- The pricing page treats commercial map printing as plan-specific and lists custom print rights separately. Source: [MapTiler Cloud pricing](https://www.maptiler.com/cloud/pricing/).

## Application decision and evidence

- Commercial launch uses a paid MapTiler plan; the Free plan is limited to development and evaluation.
- The browser requests the MapTiler style directly and enables MapLibre's attribution control. The location page also keeps visible MapTiler and OpenStreetMap text attribution beneath the map. The restricted public key is sent only from approved browser origins.
- Bed and staking-plan print routes render application-owned metric geometry as SVG. They do not request, embed, trace or screenshot MapTiler tiles or aerial imagery.
- Automated checks reject `<image>` elements and `href`/`src` references in both printable SVG types. The worker system test also confirms the delivered bed SVG contains no MapTiler content.

## Launch check retained

With the restricted paid-plan key configured in staging, visually confirm that MapLibre displays the provider-supplied linked attribution for both street and aerial styles and that the explicit page attribution remains visible at supported mobile and desktop sizes. Re-check the selected subscription terms if customer-facing basemap or aerial printing is ever proposed; the current product does not provide that export.
