# Radar calibration

Finds where each radar image sits on the map (`bounds` in `packages/core/src/radars.ts`). Needs the
boundary cache (`python3 tools/boundaries/build.py`) and `pnpm install` (image libraries come from apps/ingest).

1. Download the current frames (ThaiWater `thailand_main` → `radar.data.data[].media_path`) into `images/<radar_id>.jpg`
   (the extension doesn't matter; JPEG, PNG and GIF are detected from the content).
2. Find the radar centre pixel and scale from the image itself:
   - crosshair + ring radii: `node geom.mjs images/<id>.jpg <legend-width-px>`
   - DRRAA "Rainbow" layout (no crosshair): `node ringcenter.mjs images/<id>.jpg <right-panel-px> <km-per-px>`
3. Fit the position with that centre and scale fixed (searches ±span degrees around the site in `SITES`):
   `node fit.mjs <id> <dark|light lines> <minKmPerPx,maxKmPerPx> <ignoreRight> <ignoreLeft> <cx,cy> <span>`
   A score above ~0.4 (share of real border points landing on drawn lines) has matched well; print the `bounds`.
4. For lossless PNG sources, read the exact legend colours for the `palette` echo rule:
   `node palette.mjs images/<id>.jpg <x0> <y0> <x1> <y1> <minPixels>`

Known layouts: BMA 965×800, TMD 796×677, TMD 680×680 (centre 370,334; 0.741 km/px), DRRAA 862×800
(centre 469,393; 0.612 km/px), DRRAA Rainbow (panel 280 px on the right; 0.6 km/px).
