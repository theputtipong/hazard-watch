import { RELAY_FRESH_MINUTES } from '@hw/core';

export const INGEST = {
  maxUploadBytes: 5 * 1024 * 1024,
  cacheSeconds: { snapshot: 60, weather: 600, radar: 120, districts: 3600 },
  /** A request for a newer radar frame than the cached one re-reads the KV bundle at most this often per radar. */
  radarRecheckSeconds: 30,
  /** Open-Meteo's free tier is 10,000 calls/day (UTC); /v1/weather is its only caller, so leave headroom. */
  weatherDailyCap: 8000,
  /** One runner cycle: a suspicious upload holds its alerts until the next regular upload. */
  pushHoldMinutes: 40,
  radarDownloadTimeoutMs: 30_000,
  /**
   * GitHub's schedule is often hours late, so the edge cron dispatches the runner (needs GITHUB_DISPATCH_TOKEN).
   * Multiple of the 10-min cron; 40 keeps the private repo within 2,000 free Actions min/month (~1,320 + monitor ~360).
   */
  runnerDispatchEveryMinutes: 40,
  runnerWorkflow: 'fetch-feeds.yml',
  /** Cloudflare sometimes fires a cron twice (~30 s apart); skip dispatch if a run started this recently. */
  runnerDispatchDedupeMinutes: 5,
  /**
   * Hours between fetches; the BMA data agreement allows at most one CCTV list fetch a day. ThaiWater dam data is
   * daily and `analyst/dam` is ~1 MB, so every 6 h is enough (a skipped feed keeps its stored copy and lastOkAt).
   * Each value + runner lag must stay under the feed's maxStaleMinutes in tools/monitor/config.json (test/config.test.ts).
   */
  runnerFeedEveryHours: { cctv: 24, dams: 6 } as Partial<Record<'flood' | 'rain' | 'waterlevel' | 'radar' | 'cctv' | 'dams', number>>,
  /** A relayed BMA feed newer than this is not rewritten (saves KV writes: free plan 1,000/day). */
  relayFreshMinutes: RELAY_FRESH_MINUTES,
  /** /ingest/runner keeps a relayed flood/rain copy this recent instead of marking the feed failing. */
  relayKeepMinutes: 3 * RELAY_FRESH_MINUTES,
} as const;

/** Thailand spans ~5.6–20.5 N, 97.3–105.6 E; about 1° of margin (same box as validate.ts). */
export const THAILAND_BOUNDS = { minLat: 4.5, maxLat: 21.5, minLng: 96.5, maxLng: 106.5 } as const;
