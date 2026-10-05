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
  /**
   * GitHub's own schedule for ingest-runner.yml is often hours late, so the edge cron starts it instead
   * (workflow_dispatch) every this many minutes — only when the GITHUB_DISPATCH_TOKEN secret is set.
   * Must be a multiple of the 10-min edge cron. 40 keeps the private repo inside 2,000 free Actions minutes/month
   * (36 dispatched + ~8 late GitHub-scheduled runs a day ≈ 1,320 min, plus the 2-hourly monitor ≈ 360 min).
   */
  runnerDispatchEveryMinutes: 40,
  runnerWorkflow: 'ingest-runner.yml',
  /**
   * Runner feeds refreshed less often than every run (hours). The BMA camera list barely changes, and the
   * data request to BMA promises at most one fetch a day; skipped feeds keep their last stored copy.
   */
  runnerFeedEveryHours: { cctv: 24 } as Partial<Record<'flood' | 'rain' | 'waterlevel' | 'radar' | 'cctv', number>>,
} as const;
