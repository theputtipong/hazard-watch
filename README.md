# เฝ้าระวังภัย · HazardWatch

Public, free dashboard for weather, flooding, PM2.5 and earthquake alerts based on the viewer's location.
Covers all 77 provinces of Thailand (928 districts; subdistricts in Bangkok and the five metropolitan provinces), on a
map that zooms out to the whole world with NASA satellite layers.

Live: https://hazard.pdouvch.com · API: https://api.hazard.pdouvch.com

## Features

There are no native store apps: phones and tablets use the website (installable as a PWA), and desktop browsers can
add the extension. Every platform reads the same public API, so the data, alert thresholds and wording are identical.

### Shared by every platform

- Hazards: street flooding and rain gauges (Bangkok), canal/river levels as % of bank-full, PM2.5, earthquakes (TMD +
  USGS, duplicates merged), current weather with surface wind and the ~3 km wind that steers rain.
- NASA (display only, never an alert): fire hotspots within 25 km in the last 24 h and up to 5 open storms, volcanoes,
  floods or landslides within 500 km of the chosen district (`NASA_NEAR` in `packages/core/src/nasa.ts`).
- Levels: ปกติ / ระวัง / ระวังมาก / อันตราย (Normal / Caution / Warning / Danger), always as a word plus a three-bar meter.
  Every reading has a plain-language note on what it means and what to do.
- Data freshness: stale readings are never shown as current. "When the data last updated" lists every source.
- Thai and English.

### Web (desktop browsers)

| Feature | Notes |
|---|---|
| Dashboard | Cards for weather, PM2.5, flooding, earthquakes and river levels for your location or a chosen area |
| Map | Zones (province → district → subdistrict) coloured by the worst reading; flood, PM2.5, river and CCTV pins; legend. Zooms out to the whole world |
| NASA layers | FIRMS fire hotspots (on by default); EONET events and one GIBS image at a time (rain, flood, aerosol, fire, true colour) start off |
| Rain radar | 24 radars nationwide on the map, plus a badge showing which way rain may be moving |
| Location | Browser geolocation, or pick an area by hand (remembered on the device). Links `/<lang>?area=<id>` open an area |
| Push alerts | Web Push per district, even with the tab closed (Chrome, Edge, Firefox, Safari on macOS) |
| Sharing | Copy link, LINE, Facebook, X; link previews show the area name |
| Accessibility | Light/dark/system theme, colour-blind palette, read-aloud summary (Web Speech API), screen-reader summary |
| CCTV | Nearby BMA traffic cameras, opened at the source (BMA site, needs about 3 s to start a session) |

### Android (mobile browser / installed PWA)

- Everything the web has, in a single-column layout for phones.
- Install from Chrome's menu ("Install app" / "Add to Home screen").
- Push alerts work in the browser or the installed app.
- Read-aloud needs a Thai voice in Text-to-speech settings (the page explains how).
- Native app (`apps/mobile`): Data sources screen with links to the original sources and a notice that the app is not
  a government service; the same NASA layers and a province → district picker with search.

### iOS / iPadOS (Safari / installed PWA)

- Everything the web has, in a single-column layout for phones.
- **Push alerts need the site added to the Home Screen first** (Share → Add to Home Screen, iOS 16.4 or later).
  In a normal Safari tab the alert card explains this instead of offering the button.
- A Thai voice is built in for read-aloud.
- Native app (`apps/mobile`): Data sources screen with links to the original sources and a notice that the app is not
  a government service; the same NASA layers and a province → district picker with search.

### Desktop browser extension (Chrome, Edge)

| Feature | Notes |
|---|---|
| Notifications | Checks every 15 minutes while the browser is open; same alerts and 3-hour no-repeat rule as Web Push |
| Toolbar badge | Number of current alerts for your district, coloured by the worst level |
| Popup summary | Your district: alerts, nearest PM2.5 and river gauge, flooding, weather + wind, NASA fires/events nearby, data-source status |
| Settings | Choose hazards and the PM2.5 level; GPS or pick a district (province → district, with search) |
| Limits | Desktop Chrome/Edge only (no Firefox or mobile build yet); no server account; alerts stop when the browser is closed |

### Coverage and limits

- Area: all 77 provinces, picked down to the district; subdistricts only in Bangkok and five provinces (Nonthaburi,
  Pathum Thani, Samut Prakan, Samut Sakhon, Nakhon Pathom). Radar covers the whole country. Street flooding, rain
  gauges and CCTV are Bangkok only (BMA data); away from them those cards stay hidden.
- NASA layers cover the world map, but the cards and alerts are still for the chosen area. FIRMS hotspots are kept
  for Thailand and its neighbours only (`FIRE_BOUNDS`), EONET events worldwide.
- BMA blocks cloud IPs; street-flood and rain data arrive when a phone or extension in Thailand relays them, otherwise
  those cards show "no data".
- The rain-movement badge is an estimate from the wind forecast, not tracked from radar images.

## Layout

```
apps/
  web/      Next.js 16 (App Router) on Cloudflare Workers via OpenNext. Leaflet map. /th and /en routes.
  ingest/   Cloudflare Worker (Hono): cron for edge feeds, KV snapshots, public read API, authenticated writes,
            Web Push (D1 subscriptions, alerts after every data update).
  extension/ Chrome/Edge extension (MV3): alerts for the person's district + a summary popup, read from the public API.
  mobile/   Flutter app (iOS + Android, in development): an extra channel on the HazardWatch Mobile design system.
            Reads `/v1/area` (one district, judged with the Web Push rules) and `/v1/districts`. See its README.
packages/
  core/     Shared types, coverage regions (src/regions.ts), alert thresholds (src/config.ts), severity rules,
            i18n (src/i18n/messages.ts).
  sources/  One adapter per data source; parses into the shared types. Tested against fixtures.
  tokens/   Design system source (tokens.json). `pnpm --filter @hw/tokens generate` writes the web theme CSS, TS
            colours for Leaflet, and the palettes the Flutter app's own design system is checked against (plus its
            colour-blind mode); `test` fails if a generated file is stale.
.github/workflows/
  check-deploy-web.yml    Typecheck, lint, tests; on main also deploys what changed (see Deploy).
  check-build-mobile.yml  Flutter analyze, tests and Android/iOS builds (apps/mobile).
  fetch-feeds.yml         Fetches feeds that block Cloudflare IPs (BMA, ThaiWater) or are too big for it (NASA) and
                          pushes them to ingest.
  monitor-sources.yml     Source-outage check every 2 h; opens/closes `outage` issues (tools/monitor).
```

## Data flow

| Feed | Source | Fetched by | Why |
|---|---|---|---|
| PM2.5 | Air4Thai (PCD) | ingest cron, every 10 min | |
| Earthquakes | TMD RSS + USGS | ingest cron, every 10 min | |
| Weather | Open-Meteo | ingest, on request per location (cached 10 min) | |
| Street flooding, rain gauges | BMA Drainage Dept. (unofficial endpoints) | GitHub Actions, every 40 min, plus relays from the app/extension on Thai IPs (`POST /v1/relay/bma/:kind`, see below) | 403 bot challenge from Cloudflare (and GitHub) IPs |
| Canal/river levels, radar images | ThaiWater (HII) | GitHub Actions, every 40 min | 429 rate limit from Cloudflare IPs; radar frames are cut to rain echoes only (`apps/ingest/scripts/radarImage.ts`) and placed with `packages/core/src/radars.ts` |
| CCTV list | BMA Traffic | GitHub Actions, once a day (`INGEST.runnerFeedEveryHours`) | pins + link to source only |
| Fire hotspots | NASA FIRMS: keyless SouthEast_Asia 24 h CSVs of the three VIIRS satellites (NOAA-20, NOAA-21, Suomi NPP) | GitHub Actions, every run | each CSV is ~1.8 MB, too big for the Worker's 10 ms CPU; rows outside `FIRE_BOUNDS` dropped, capped at 3,000 (`FIRE_CAP`) |
| Natural events | NASA EONET: open severe storms, volcanoes, floods, landslides (wildfires come from FIRMS) | GitHub Actions, every run | capped at 100 events (`EVENT_CAP`), 40 track points each |
| Satellite imagery | NASA GIBS tiles (`NASA_LAYERS` in `packages/core/src/nasa.ts`) | browser / app, straight from NASA | nothing on our side; one raster at a time, all off by default because GIBS sends `no-store` |
| Base map | OpenFreeMap vector tiles via MapLibre GL in Leaflet (`positron` / `dark`, follows the theme; labels in the page language) | browser | config in `WEB.map.openfreemap`; free public instance, no key; falls back to OSM raster automatically without WebGL or if the style fails to load |

GitHub's own schedule for `fetch-feeds.yml` runs hours late, so the ingest cron starts it with `workflow_dispatch`
every `INGEST.runnerDispatchEveryMinutes` (40, to stay inside the 2,000 free Actions minutes of a private repo).
That needs the Worker secret `GITHUB_DISPATCH_TOKEN`: a fine-grained token for this repo only, with
*Actions: Read and write* (GitHub answers 403 if the permission or repo is missing, 401 if the token is wrong).
The GitHub schedule stays as a fallback. The ingest keeps feeds left out of a runner upload (e.g. the daily CCTV list).

BMA relay: the app and the extension send the raw BMA `flood`/`rain` list they downloaded to `POST /v1/relay/bma/:kind`.
It needs no key, so the ingest takes it only from Thai IPs (Cloudflare `cf.country`, else 403), answers
`{ok: true, written: false}` without a KV write while its copy is younger than `INGEST.relayFreshMinutes` (10, to stay
inside the 1,000 free KV writes a day), and re-parses the list with the runner's parser, limits and push hold. A runner
upload whose BMA fetch failed does not overwrite a relay copy younger than `INGEST.relayKeepMinutes` (30).

## Develop

Requires Node 22 and pnpm 10 (`corepack install -g pnpm@10.34.6`).

```bash
pnpm install
cp apps/ingest/.dev.vars.example apps/ingest/.dev.vars   # add VAPID_PRIVATE_KEY=... for push
pnpm --filter @hw/ingest exec wrangler d1 migrations apply hw-push --local
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @hw/ingest dev        # http://localhost:8787 (curl /__scheduled to run the cron)
#   use this script, not bare `wrangler dev`: it passes --local-upstream so localhost CORS origins survive the prod route
INGEST_URL=http://localhost:8787 INGEST_TOKEN=dev-token-change-me pnpm --filter @hw/ingest runner
pnpm --filter @hw/web dev           # http://localhost:3000
# manual deploy (normally done by CI, see Deploy): pnpm --filter @hw/ingest run deploy, then pnpm --filter @hw/web run deploy
#      NEXT_PUBLIC_TILE_PROVIDER=osm falls back to OSM raster tiles (emergency/dev only)
# a fresh checkout needs `pnpm --filter @hw/web exec next typegen` before typecheck
pnpm test && pnpm typecheck
```

## Deploy

Pushing to `main` runs `.github/workflows/check-deploy-web.yml`: checks first, then only the parts that changed are deployed.

| Job | Runs when | Does |
|---|---|---|
| `deploy-ingest` | `apps/ingest`, `packages`, district polygons or the lockfile changed | `wrangler d1 migrations apply hw-push --remote`, then `wrangler deploy` |
| `deploy-web` | `apps/web`, `packages` or the lockfile changed (after ingest, which goes first) | OpenNext build + deploy with `NEXT_PUBLIC_API_BASE=https://api.hazard.pdouvch.com` |
| `extension` | `apps/extension`, `packages` or geo files changed | builds the store zip as a run artifact (store upload stays manual) |

*Run workflow* → `deploy_all` redeploys both without a change. Needs, in the GitHub repo settings:
- secret `CLOUDFLARE_API_TOKEN`: Cloudflare token from the "Edit Cloudflare Workers" template plus *D1: Edit*
  (account `Puttipong.dou@gmail.com's Account`, zone `pdouvch.com`);
- variable `CLOUDFLARE_ACCOUNT_ID`.

Worker secrets (`VAPID_PRIVATE_KEY`, `INGEST_TOKEN`, `GITHUB_DISPATCH_TOKEN`) live in Cloudflare and are kept across deploys.

## Adding coverage

`ACTIVE_REGION_IDS` in `packages/core/src/regions.ts` is `['th-all']`: one region for the 77 provinces (the old
`th-bangkok-metro` stays defined). Adapters filter by the active regions automatically; sources that only exist for
one area (e.g. BMA) need no change. A new country needs its own region and adapters in `packages/sources`.

Boundaries: `python3 tools/boundaries/build.py` writes `apps/web/public/geo` (ids are OCHA pcodes, so saved areas and
push subscriptions stay valid):

| File | Used by | Detail |
|---|---|---|
| `provinces.json`, `districts.json` | web map | 77 provinces / 928 districts, simplified up to 0.004° (~1.16 MB, budget 1.2 MB) |
| `districts-lite.json` | ingest Worker, extension, app (`gen_geo`) | 0.015° outside Greater Bangkok (~591 KB, budget 600 KB / 200 KB gzip); the six metropolitan provinces and their borders are kept exactly as in `districts.json`, so Bangkok alerts match the map |
| `subdistricts.json` | web map | Bangkok and five provinces only (`SUBDISTRICT_PROVINCES`) |
| `names.json` | link previews | names only, no polygons |

After a rebuild run `pnpm --filter @hw/mobile generate`. The Worker looks districts up through a grid `ZoneIndex`
(`apps/ingest/src/geo.ts`), and push reads subscriptions in chunks of 90 districts (D1's bound-parameter limit). The
extension bundles `districts-lite.json` once in a chunk shared by the service worker and the popup.

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
- App icons: `node tools/icons/make-icons.mjs` (renders the design system SVGs in `tools/icons/source`).
- Alert titles start with the level word: `<ระวัง|ระวังมาก|อันตราย>: <what> ที่<where>` (`alert.*` in i18n).

## Browser extension

- `pnpm --filter @hw/extension build` → load `apps/extension/dist` unpacked (`chrome://extensions`, Developer mode).
  `API_BASE=http://localhost:8787` builds against a local ingest.
- Store upload (Chrome Web Store / Edge Add-ons): `pnpm --filter @hw/extension run zip` → upload
  `apps/extension/hazardwatch-extension-<version>.zip` only (manifest.json at its root). Bump `version` in
  `apps/extension/package.json` for each upload. Icons: `node tools/icons/make-icons.mjs`.
- No server state: every `pollMinutes` (15, `apps/extension/src/config.ts`) the service worker reads `/v1/snapshot`,
  builds the same alerts as Web Push for the chosen district (`localAlerts` → core `districtAlerts` / `quakeAlerts`),
  shows new ones as notifications (repeat after `push.cooldownHours`) and sets the toolbar badge.
- When the server's BMA flood/rain copy is 10 min old or more it fetches BMA and relays it (`src/relay.ts`, see Data
  flow). That needs the host permission `https://weather.bangkok.go.th/*` (`build.mjs`); Chrome asks existing users to
  accept it when they update.
- Popup: area (GPS or a picked district), alerts (up to `maxBanners`), weather + wind, nearest PM2.5 / river gauge,
  flooding in the district, and "when the data last updated" (core `feedStatuses`, shared with the web). Text lives in
  core i18n (`ext.*`, `feeds.*`, `note.*`, `gauge.*`). Fonts (IBM Plex Sans Thai 400/500/600) ship in `static/fonts`.
- Store screenshots: `apps/extension/screenshots/` (Thai/English × light/dark), taken from headless Edge with the
  unpacked build.

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

`.github/workflows/monitor-sources.yml` runs `tools/monitor/check.mjs` every 2 hours (to stay inside the free Actions minutes) (and on demand via *Run workflow*).
It reads `/v1/snapshot` and treats a feed as down when its last successful fetch (`lastOkAt`, kept by the ingest
store across failures; `failingSince` marks the first failure) is older than the feed's threshold.

- One open GitHub issue per down feed, labelled `outage`, titled `แหล่งข้อมูลล่ม: <feed>`. No repeat comments while it
  stays down; when the feed recovers the issue gets a comment and is closed automatically.
- If the API itself is unreachable, it opens `แหล่งข้อมูลล่ม: api` and leaves the per-feed issues alone.
- Thresholds and the ignore list are in `tools/monitor/config.json`: group defaults (`edge` 60 min for the Cloudflare
  cron, `runner` 6 h because GitHub schedules can run hours late), per-feed overrides under `feeds`, and `ignore`
  (default: BMA `flood` and `rain`, which answer 403 to both Cloudflare and GitHub IPs). The daily CCTV list has its own
  30 h limit; keep `feeds.cctv` in step with `INGEST.runnerFeedEveryHours.cctv`, and the group limits in step with
  `FEED_MAX_AGE_MINUTES` in `packages/core/src/feeds.ts` (what the web and extension show as "no new data").
- Uses only the built-in `GITHUB_TOKEN` (`issues: write`). Try it locally without touching GitHub:
  `node tools/monitor/check.mjs --dry-run` (tests: `node --test tools/monitor/check.test.mjs`).

## Data credits

กรมอุตุนิยมวิทยา · สำนักการระบายน้ำ กรุงเทพมหานคร · สถาบันสารสนเทศทรัพยากรน้ำ (ThaiWater) · กรมควบคุมมลพิษ ·
GISTDA · USGS · Open-Meteo · © OpenStreetMap contributors

NASA (`NASA_ATTRIBUTION` in `packages/core/src/nasa.ts`), shown next to each layer and card:
- Imagery: NASA EOSDIS GIBS / Worldview
- Fires: NASA FIRMS (LANCE/ESDIS)
- Events: NASA EONET

Zone boundaries (`apps/web/public/geo`, rebuilt with `python3 tools/boundaries/build.py`): BMA GIS (Bangkok subdistricts),
geoBoundaries THA ADM1 (OSM, ODbL) and ADM2 (RTSD/OCHA, CC BY-IGO), OCHA COD-AB names (CC BY-IGO).
