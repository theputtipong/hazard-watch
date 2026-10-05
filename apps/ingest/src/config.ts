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
   */
  runnerDispatchEveryMinutes: 30,
  runnerWorkflow: 'ingest-runner.yml',
} as const;
