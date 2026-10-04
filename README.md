# เฝ้าระวังภัย · HazardWatch

Public, free dashboard for weather, flooding, PM2.5 and earthquake alerts based on the viewer's location.
Currently covers Bangkok and the five metropolitan provinces; built to expand to all of Thailand and beyond.

## Layout

```
apps/
  web/      Next.js 16 (App Router) on Cloudflare Workers via OpenNext. Leaflet map. /th and /en routes.
  ingest/   Cloudflare Worker (Hono): cron for edge feeds, KV snapshots, public read API, authenticated writes.
packages/
  core/     Shared types, coverage regions (src/regions.ts), alert thresholds (src/config.ts), severity rules,
            i18n (src/i18n/messages.ts).
  sources/  One adapter per data source; parses into the shared types. Tested against fixtures.
.github/workflows/
  ingest-runner.yml  Fetches feeds that block Cloudflare IPs (BMA, ThaiWater) and pushes them to ingest.
  ci.yml             Typecheck + tests.
```

## Data flow

| Feed | Source | Fetched by | Why |
|---|---|---|---|
| PM2.5 | Air4Thai (PCD) | ingest cron, every 10 min | |
| Earthquakes | TMD RSS + USGS | ingest cron, every 10 min | |
| Weather | Open-Meteo | ingest, on request per location (cached 10 min) | |
| Street flooding, rain gauges | BMA Drainage Dept. (unofficial endpoints) | GitHub Actions, every 30 min | 403 bot challenge from Cloudflare IPs |
| Canal/river levels, radar images | ThaiWater (HII) | GitHub Actions, every 30 min | 429 rate limit from Cloudflare IPs |
| CCTV list | BMA Traffic | GitHub Actions | pins + link to source only |

## Develop

Requires Node 22 and pnpm 10 (`corepack install -g pnpm@10.34.6`).

```bash
pnpm install
cp apps/ingest/.dev.vars.example apps/ingest/.dev.vars
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @hw/ingest dev        # http://localhost:8787 (curl /__scheduled to run the cron)
INGEST_URL=http://localhost:8787 INGEST_TOKEN=dev-token-change-me pnpm --filter @hw/ingest runner
pnpm --filter @hw/web dev           # http://localhost:3000
pnpm test && pnpm typecheck
```

## Adding coverage

Add a region to `REGIONS` in `packages/core/src/regions.ts` and its id to `ACTIVE_REGION_IDS`. Adapters filter by
the active regions automatically; sources that only exist for one area (e.g. BMA) need no change. A new country
needs its own adapters in `packages/sources`.

## Tuning alerts

All thresholds are in `packages/core/src/config.ts` (`DEFAULT_CONFIG`). UI text for both languages is in
`packages/core/src/i18n/messages.ts`.

## Data credits

กรมอุตุนิยมวิทยา · สำนักการระบายน้ำ กรุงเทพมหานคร · สถาบันสารสนเทศทรัพยากรน้ำ (ThaiWater) · กรมควบคุมมลพิษ ·
GISTDA · USGS · Open-Meteo · © OpenStreetMap contributors

Zone boundaries (`apps/web/public/geo`, rebuilt with `python3 tools/boundaries/build.py`): BMA GIS (Bangkok subdistricts),
geoBoundaries THA ADM1 (OSM, ODbL) and ADM2 (RTSD/OCHA, CC BY-IGO), OCHA COD-AB names (CC BY-IGO).
