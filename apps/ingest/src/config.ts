export const INGEST = {
  maxUploadBytes: 5 * 1024 * 1024,
  cacheSeconds: { snapshot: 60, weather: 600, radar: 120 },
  radarDownloadTimeoutMs: 30_000,
  /**
   * GitHub's schedule is often hours late, so the edge cron dispatches the runner (needs GITHUB_DISPATCH_TOKEN).
   * Multiple of the 10-min cron; 40 keeps the private repo within 2,000 free Actions min/month (~1,320 + monitor ~360).
   */
  runnerDispatchEveryMinutes: 40,
  runnerWorkflow: 'ingest-runner.yml',
  /** Cloudflare sometimes fires a cron twice (~30 s apart); skip dispatch if a run started this recently. */
  runnerDispatchDedupeMinutes: 5,
  /** Hours between fetches; the BMA data agreement allows at most one CCTV list fetch a day. */
  runnerFeedEveryHours: { cctv: 24 } as Partial<Record<'flood' | 'rain' | 'waterlevel' | 'radar' | 'cctv', number>>,
} as const;
