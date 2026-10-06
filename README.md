# เฝ้าระวังภัย · HazardWatch

Public, free dashboard for weather, flooding, PM2.5 and earthquake alerts based on the viewer's location.
Currently covers Bangkok and the five metropolitan provinces; built to expand to all of Thailand and beyond.

Live: https://hazard.pdouvch.com · API: https://api.hazard.pdouvch.com

## Layout

```
apps/
  web/      Next.js 16 (App Router) on Cloudflare Workers via OpenNext. Leaflet map. /th and /en routes.
  ingest/   Cloudflare Worker (Hono): cron for edge feeds, KV snapshots, public read API, authenticated writes,
            Web Push (D1 subscriptions, alerts after every data update).
  extension/ Chrome/Edge extension (MV3): alerts for the person's district + a summary popup, read from the public API.
packages/
  core/     Shared types, coverage regions (src/regions.ts), alert thresholds (src/config.ts), severity rules,
            i18n (src/i18n/messages.ts).
  sources/  One adapter per data source; parses into the shared types. Tested against fixtures.
.github/workflows/
  ingest-runner.yml  Fetches feeds that block Cloudflare IPs (BMA, ThaiWater) and pushes them to ingest.
  ci.yml             Typecheck + tests.
  monitor.yml        Source-outage check every 2 h; opens/closes `outage` issues (tools/monitor).
```

## Data flow

| Feed | Source | Fetched by | Why |
|---|---|---|---|
| PM2.5 | Air4Thai (PCD) | ingest cron, every 10 min | |
| Earthquakes | TMD RSS + USGS | ingest cron, every 10 min | |
| Weather | Open-Meteo | ingest, on request per location (cached 10 min) | |
| Street flooding, rain gauges | BMA Drainage Dept. (unofficial endpoints) | GitHub Actions, every 40 min (see below) | 403 bot challenge from Cloudflare IPs |
| Canal/river levels, radar images | ThaiWater (HII) | GitHub Actions, every 40 min | 429 rate limit from Cloudflare IPs; radar frames are cut to rain echoes only (`apps/ingest/scripts/radarImage.ts`) and placed with `packages/core/src/radars.ts` |
| CCTV list | BMA Traffic | GitHub Actions, once a day (`INGEST.runnerFeedEveryHours`) | pins + link to source only |
| Base map | OpenFreeMap vector tiles via MapLibre GL in Leaflet (`positron` / `dark`, follows the theme; labels in the page language) | browser | config in `WEB.map.openfreemap`; free public instance, no key; falls back to OSM raster automatically without WebGL or if the style fails to load |

GitHub's own schedule for `ingest-runner.yml` runs hours late, so the ingest cron starts it with `workflow_dispatch`
every `INGEST.runnerDispatchEveryMinutes` (40, to stay inside the 2,000 free Actions minutes of a private repo).
That needs the Worker secret `GITHUB_DISPATCH_TOKEN`: a fine-grained token for this repo only, with
*Actions: Read and write* (GitHub answers 403 if the permission or repo is missing, 401 if the token is wrong).
The GitHub schedule stays as a fallback. The ingest keeps feeds left out of a runner upload (e.g. the daily CCTV list).

## Develop

Requires Node 22 and pnpm 10 (`corepack install -g pnpm@10.34.6`).

```bash
pnpm install
cp apps/ingest/.dev.vars.example apps/ingest/.dev.vars   # add VAPID_PRIVATE_KEY=... for push
pnpm --filter @hw/ingest exec wrangler d1 migrations apply hw-push --local
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @hw/ingest dev        # http://localhost:8787 (curl /__scheduled to run the cron)
INGEST_URL=http://localhost:8787 INGEST_TOKEN=dev-token-change-me pnpm --filter @hw/ingest runner
pnpm --filter @hw/web dev           # http://localhost:3000
# deploy order: D1 migrations (--remote) → git push → ingest deploy → web deploy
# web: NEXT_PUBLIC_API_BASE=https://api.hazard.pdouvch.com pnpm --filter @hw/web run deploy
#      add NEXT_PUBLIC_TILE_PROVIDER=osm to fall back to OSM raster tiles (emergency/dev only)
# a fresh checkout needs `pnpm --filter @hw/web exec next typegen` before typecheck
pnpm test && pnpm typecheck
```

## Adding coverage

Add a region to `REGIONS` in `packages/core/src/regions.ts` and its id to `ACTIVE_REGION_IDS`. Adapters filter by
the active regions automatically; sources that only exist for one area (e.g. BMA) need no change. A new country
needs its own adapters in `packages/sources`.

## Push notifications

- Subscriptions live in D1 `hw-push` (schema in `apps/ingest/migrations`); only district/subdistrict codes are stored.
- VAPID: public key in `apps/ingest/wrangler.jsonc`, private key as the Worker secret `VAPID_PRIVATE_KEY`.
  Changing the key pair invalidates every existing subscription.
- New migration: add `apps/ingest/migrations/000N_*.sql`, then `wrangler d1 migrations apply hw-push --remote`
  **before** deploying code that uses it.
- People choose their own PM2.5 level and earthquake limit (magnitude / distance) from presets only:
  `push.quakeChoices` in `packages/core/src/config.ts`, `WEB.push.*` in `apps/web/src/config.ts`. Unknown values fall
  back to the central default (stored as NULL).
- Another channel (Telegram, LINE): implement `Notifier` in `apps/ingest/src/push/notifier.ts`.
- App icons: `node tools/icons/make-icons.mjs`.

## Browser extension

- `pnpm --filter @hw/extension build` → load `apps/extension/dist` unpacked (`chrome://extensions`, Developer mode).
  `API_BASE=http://localhost:8787` builds against a local ingest.
- Store upload (Chrome Web Store / Edge Add-ons): `pnpm --filter @hw/extension run zip` → upload
  `apps/extension/hazardwatch-extension-<version>.zip` only (manifest.json at its root). Bump `version` in
  `apps/extension/package.json` for each upload. Icons: `node tools/icons/make-icons.mjs`.
- No server state: every `pollMinutes` (15, `apps/extension/src/config.ts`) the service worker reads `/v1/snapshot`,
  builds the same alerts as Web Push for the chosen district (`localAlerts` → core `districtAlerts` / `quakeAlerts`),
  shows new ones as notifications (repeat after `push.cooldownHours`) and sets the toolbar badge.
- Popup: area (GPS or a picked district), alerts, weather + wind, nearest PM2.5 / river gauge, flooding in the
  district, and each feed's status (same age limits as `tools/monitor/config.json`). Text lives in core i18n (`ext.*`).

## Radar

- Radars and where their images sit on the map: `packages/core/src/radars.ts` (24 calibrated, nationwide: BMA 2, TMD 14, DRRAA 8).
- Adding or re-fitting a radar: `tools/radar-calibrate/README.md`.
- Wind: `/v1/weather` carries Open-Meteo 10 m wind and 700 hPa (~3 km) wind. The map badge over the radar uses the
  700 hPa wind as a rough guide to which way rain is drifting (`WEB.map.driftCalmKmh` = "barely moving"); it is
  not tracked from radar frames.

## Sharing an area

- Links `/<lang>?area=<id>` open the dashboard on that area (ids nest by prefix: `TH10` province, `TH1028`
  district, `TH102803` subdistrict). The address bar follows the area the user selects.
- The Share button (levels in `WEB.share.levels`) uses the device share sheet, or copy link / LINE / Facebook / X.
- Link previews use `apps/web/public/geo/names.json` (built with the boundaries) so the server never loads polygons.

## Design tokens

Follows the HazardWatch design system (tokens.json): colours (`bg`, `surface`, `ink`, `ink-muted`, `line`, `accent`,
`sev-*` / `sev-*-ink` / `sev-*-soft`), the type scale (`text-caption`, `text-label`, `text-body`, `text-title`, `text-heading`,
`text-figure-sm`, `text-figure`) and radii (`rounded-tiny … rounded-card`) are defined once in
`apps/web/src/app/globals.css`; the extension popup mirrors them in `apps/extension/static/popup.css`. `sev-*` colours
mean risk only (never buttons or data freshness). Level words: ปกติ / ระวัง / ระวังมาก / อันตราย. Icons come from the design
system SVGs in `tools/icons/source` (`node tools/icons/make-icons.mjs`), never redrawn.

## Tuning alerts

All thresholds are in `packages/core/src/config.ts` (`DEFAULT_CONFIG`). Rain: per hour 10/30/60 mm (WMO/JMA, BMA
drainage capacity) and, where a gauge reports it, 24 h totals 35.1/60/90.1 mm (TMD classes) — a gauge takes the worse
of the two. River/canal level: 70/100/120 % of bank-full (70/100 from ThaiWater). UI text for both languages is in
`packages/core/src/i18n/messages.ts`.

## Monitoring

`.github/workflows/monitor.yml` runs `tools/monitor/check.mjs` every 2 hours (to stay inside the free Actions minutes) (and on demand via *Run workflow*).
It reads `/v1/snapshot` and treats a feed as down when its last successful fetch (`lastOkAt`, kept by the ingest
store across failures; `failingSince` marks the first failure) is older than the feed's threshold.

- One open GitHub issue per down feed, labelled `outage`, titled `แหล่งข้อมูลล่ม: <feed>`. No repeat comments while it
  stays down; when the feed recovers the issue gets a comment and is closed automatically.
- If the API itself is unreachable, it opens `แหล่งข้อมูลล่ม: api` and leaves the per-feed issues alone.
- Thresholds and the ignore list are in `tools/monitor/config.json`: group defaults (`edge` 60 min for the Cloudflare
  cron, `runner` 6 h because GitHub schedules can run hours late), per-feed overrides under `feeds`, and `ignore`
  (default: BMA `flood` and `rain`, which answer 403 to both Cloudflare and GitHub IPs). The daily CCTV list has its own
  30 h limit; keep `feeds.cctv` in step with `INGEST.runnerFeedEveryHours.cctv`.
- Uses only the built-in `GITHUB_TOKEN` (`issues: write`). Try it locally without touching GitHub:
  `node tools/monitor/check.mjs --dry-run` (tests: `node --test tools/monitor/check.test.mjs`).

## Data credits

กรมอุตุนิยมวิทยา · สำนักการระบายน้ำ กรุงเทพมหานคร · สถาบันสารสนเทศทรัพยากรน้ำ (ThaiWater) · กรมควบคุมมลพิษ ·
GISTDA · USGS · Open-Meteo · © OpenStreetMap contributors

Zone boundaries (`apps/web/public/geo`, rebuilt with `python3 tools/boundaries/build.py`): BMA GIS (Bangkok subdistricts),
geoBoundaries THA ADM1 (OSM, ODbL) and ADM2 (RTSD/OCHA, CC BY-IGO), OCHA COD-AB names (CC BY-IGO).
