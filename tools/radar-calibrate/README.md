# Radar calibration

Finds where each radar image sits on the map (`bounds` in `packages/core/src/radars.ts`). Needs the
boundary cache (`python3 tools/boundaries/build.py`) and `pnpm install` (image libraries come from apps/ingest).

1. Download the current frames (ThaiWater `thailand_main` → `radar.data.data[].media_path`) into `images/<radar_id>.jpg`
   (the extension doesn't matter; JPEG, PNG and GIF are detected from the content).
2. Find the radar centre pixel and scale from the image itself:
   - crosshair + ring radii: `node geom.mjs images/<id>.jpg <legend-width-px>`
   - DRRAA "Rainbow" layout (no crosshair): `node ringcenter.mjs images/<id>.jpg <right-panel-px> <km-per-px>`
3. Fit the position with that centre and scale fixed (searches ±span degrees around the site in `SITES`):
   `node fit.mjs <id> <dark|light|ridge|coast> <minKmPerPx,maxKmPerPx> <ignoreRight> <ignoreLeft> <cx,cy> <span>`
   Line masks: `dark`/`light` = province lines of that colour, `ridge` = thin lines brighter than their
   surroundings (blurry JPEG borders), `coast` = land next to sea (for coastal radars).
   A score above ~0.4 (share of real border points landing on drawn lines) has matched well; print the `bounds`.
   If no mask scores well, solve from the towns drawn on the image instead:
   `python3 citydots.py '[[x, y, lat, lon], ...]' <w>,<h>` (residuals of 1–3 km are normal; tens of km means the
   town labels are not placed on a lat/lon grid, as on DRRAA Sattahip — use the border fit there).
3b. Always check a fit by eye: `node verify.mjs images/<id>.jpg <south,west,north,east> out.png` draws the real
   province borders in red on the image; they should sit on the image's own borders and coasts.
4. For lossless PNG sources, read the exact legend colours for the `palette` echo rule:
   `node palette.mjs images/<id>.jpg <x0> <y0> <x1> <y1> <minPixels>`

Known layouts: BMA 965×800, TMD 796×677, TMD 680×680 (centre ~370,334 but it varies per image, e.g. Phuket 357,334; 0.73–0.77 km/px; some draw a red crosshair that must be in `ignore`), DRRAA 862×800
(centre 469,393; 0.612 km/px), DRRAA Rainbow (panel on the right from x=800 or width−280; 0.6 km/px; Takhli prints its site coordinates at the bottom).

Echo rules: TMD 680 images sit on an olive terrain map (chroma ~60), so they use `minChroma: 100` with despeckle.
