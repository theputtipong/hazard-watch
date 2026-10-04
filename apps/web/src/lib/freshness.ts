import { isStale, type AlertConfig, type SourceResult } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';

export interface Freshness {
  state: 'fresh' | 'stale' | 'failed';
  /** Time of the newest data we are showing. */
  at: string | null;
}

/**
 * How current a feed is. 'failed' = the last fetch errored and we show older items;
 * 'stale' = the newest reading is older than `staleAfterMinutes`.
 */
export function feedFreshness(
  result: SourceResult<unknown> | undefined,
  cfg: AlertConfig,
  now = new Date(),
  timeOf: (item: never) => string | undefined = (item) => (item as { observedAt?: string }).observedAt,
): Freshness | null {
  if (!result) return null;
  const times = result.items.map((it) => timeOf(it as never)).filter((x): x is string => !!x);
  const latest = times.length ? times.reduce((a, b) => (a > b ? a : b)) : result.fetchedAt;
  if (!result.ok) return { state: 'failed', at: result.items.length ? latest : null };
  return { state: isStale(latest, cfg, now) ? 'stale' : 'fresh', at: latest };
}

export function freshnessNote(f: Freshness | null, lang: Lang): string | undefined {
  if (!f || f.state === 'fresh' || !f.at) return undefined;
  const time = new Date(f.at).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  });
  return t(f.state === 'failed' ? 'fresh.failed' : 'fresh.stale', lang, { time });
}
