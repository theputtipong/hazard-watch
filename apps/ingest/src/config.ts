/**
 * Ingest worker settings. The cron schedule itself lives in wrangler.jsonc ("triggers.crons"),
 * and the GitHub Actions schedule in .github/workflows/ingest-runner.yml.
 */
export const INGEST = {
  /** Largest upload accepted from the runner (snapshot JSON or a radar image). */
  maxUploadBytes: 5 * 1024 * 1024,
  /** Browser/CDN cache time (seconds) for each public endpoint. */
  cacheSeconds: { snapshot: 60, weather: 600, radar: 120 },
  /** Timeout when the runner downloads a radar image. */
  radarDownloadTimeoutMs: 30_000,
} as const;
