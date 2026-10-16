import { t, type Lang } from './i18n';
import type { DashboardSnapshot, SourceResult } from './types';

/** Design system FeedStatus order; both quake sources count as one topic. NASA topics go last: they are context, not alerts. */
export const FEED_TOPICS = ['flood', 'rain', 'waterlevel', 'radar', 'pm25', 'quakes', 'fires', 'events'] as const;
export type FeedTopic = (typeof FEED_TOPICS)[number];

/** Must match the group limits in tools/monitor/config.json. */
export const FEED_MAX_AGE_MINUTES = { edge: 60, runner: 360 } as const;

export interface FeedStatus {
  topic: FeedTopic;
  /** live = fresh · stale = no new data for too long · down = the last fetch failed. */
  state: 'live' | 'stale' | 'down';
  lastOkAt: string | null;
  failingSince: string | null;
}

const SOURCES: Record<FeedTopic, { group: 'edge' | 'runner'; feeds: string[] }> = {
  flood: { group: 'runner', feeds: ['flood'] },
  rain: { group: 'runner', feeds: ['rain'] },
  waterlevel: { group: 'runner', feeds: ['waterlevel'] },
  radar: { group: 'runner', feeds: ['radar'] },
  pm25: { group: 'edge', feeds: ['pm25'] },
  quakes: { group: 'edge', feeds: ['quakesTmd', 'quakesUsgs'] },
  // Fetched by the runner: FIRMS CSVs are too big to parse inside the Worker's CPU budget.
  fires: { group: 'runner', feeds: ['fires'] },
  events: { group: 'runner', feeds: ['events'] },
};

const RANK = { live: 0, stale: 1, down: 2 } as const;

function one(r: SourceResult<unknown>, maxAgeMinutes: number, now: Date): Omit<FeedStatus, 'topic'> {
  const lastOkAt = r.lastOkAt ?? (r.ok ? r.fetchedAt : null);
  if (!r.ok) return { state: 'down', lastOkAt, failingSince: r.failingSince ?? r.fetchedAt };
  const old = !lastOkAt || now.getTime() - Date.parse(lastOkAt) > maxAgeMinutes * 60_000;
  return { state: old ? 'stale' : 'live', lastOkAt, failingSince: null };
}

/** Judged like tools/monitor: by the age of the last successful fetch. */
export function feedStatuses(snapshot: DashboardSnapshot, now = new Date()): FeedStatus[] {
  const out: FeedStatus[] = [];
  for (const topic of FEED_TOPICS) {
    const { group, feeds } = SOURCES[topic];
    const results = feeds
      .map((f) => (snapshot[group]?.feeds as Record<string, SourceResult<unknown> | undefined> | undefined)?.[f])
      .filter((r): r is SourceResult<unknown> => !!r)
      .map((r) => one(r, FEED_MAX_AGE_MINUTES[group], now));
    if (!results.length) continue;
    // Several sources for one topic: the topic is as good as its best source.
    const best = results.reduce((a, b) => (RANK[b.state] < RANK[a.state] || (b.state === a.state && (b.lastOkAt ?? '') > (a.lastOkAt ?? '')) ? b : a));
    out.push({ topic, ...best });
  }
  return out;
}

const minutesSince = (iso: string, now: Date) => Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));

export function agoText(iso: string, lang: Lang, now = new Date()): string {
  const min = minutesSince(iso, now);
  if (min < 2) return t('time.justNow', lang);
  return min < 120 ? t('time.minAgo', lang, { n: min }) : t('time.hourAgo', lang, { n: Math.round(min / 60) });
}

const bangkokDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

/** Adds the date when not today, so an old time never reads as today. */
export function clockText(iso: string, lang: Lang, now = new Date()): string {
  const d = new Date(iso);
  const locale = lang === 'th' ? 'th-TH' : 'en-GB';
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
  const day = bangkokDay(d) === bangkokDay(now) ? '' : `${d.toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })} `;
  // Non-breaking spaces keep "5 ต.ค. 21:40 น." on one line.
  return t('time.clock', lang, { time: day + time }).replace(/ /g, '\u00a0');
}

export function feedAgeText(f: FeedStatus, lang: Lang, now = new Date()): string {
  if (f.state === 'down') return f.failingSince ? t('feeds.down', lang, { time: clockText(f.failingSince, lang, now) }) : t('feeds.downNever', lang);
  if (!f.lastOkAt) return t('feeds.downNever', lang);
  if (f.state === 'live') return agoText(f.lastOkAt, lang, now);
  const min = minutesSince(f.lastOkAt, now);
  const age = min < 120 ? t('time.mins', lang, { n: min }) : t('time.hours', lang, { n: Math.round(min / 60) });
  return t('feeds.stale', lang, { age });
}
