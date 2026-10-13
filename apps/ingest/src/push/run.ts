import {
  alertsDue,
  DEFAULT_CONFIG,
  districtAlerts,
  loosestQuakeLimit,
  mergeQuakes,
  quakeAlerts,
  sentRetentionMs,
  type Alert,
  type AlertConfig,
  type DashboardSnapshot,
  type Earthquake,
  type Observation,
  type ZoneFeature,
} from '@hw/core';
import { FEEDS } from '@hw/sources';
import districtsFile from '../../../web/public/geo/districts.json';
import { webPushNotifier, type DeliveryResult, type Notifier, type OutgoingMessage, type WebPushTarget } from './notifier';
import { quakeLimitFor } from './prefs';
import { pruneRateLimits } from './guard';
import { forgetOldSends, markSent, recordDelivery, SENT_IDS_PER_QUERY, sentSinceMany, subscriptionsIn, type SubscriptionPrefs, type SubscriptionRow } from './store';

export const DISTRICTS = (districtsFile as unknown as { features: ZoneFeature[] }).features;
export const DISTRICT_IDS = new Set(DISTRICTS.map((d) => d.properties.id));

export interface PushEnv {
  PUSH_DB: D1Database;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  SITE_URL: string;
}

/** Fetches the cron invocation makes besides push sends: each edge feed, plus the runner dispatch (list runs + dispatch). */
export const OTHER_FETCHES_PER_RUN = Object.keys(FEEDS.edge).length + 2;

/** Push-service requests one run may make: the subrequest budget minus the cron's own fetches, never above maxPerRun. */
export function sendBudget(cfg: AlertConfig = DEFAULT_CONFIG): number {
  return Math.max(0, Math.min(cfg.push.maxPerRun, cfg.push.maxSubrequests - OTHER_FETCHES_PER_RUN));
}

/** Attempts that must all come back 401/403 before a run is judged a VAPID problem and stopped. */
export const AUTH_STOP_AFTER = 3;

export const notifierFor = (env: PushEnv) =>
  webPushNotifier({ subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY });

export function messageFor(alert: Pick<Alert, 'title' | 'body' | 'key'>, sub: Pick<SubscriptionRow, 'lang'>, siteUrl: string): OutgoingMessage {
  return { title: alert.title[sub.lang], body: alert.body[sub.lang], url: `${siteUrl}/${sub.lang}`, tag: alert.key };
}

export function wanted(alerts: Alert[], prefs: SubscriptionPrefs): Alert[] {
  const kinds = new Set(prefs.kinds?.length ? prefs.kinds : DEFAULT_CONFIG.push.kinds);
  const pmAt = prefs.pm25At ?? DEFAULT_CONFIG.pm25.pushAt;
  return alerts.filter((a) => kinds.has(a.kind) && (a.kind !== 'pm25' || (a.value ?? 0) >= pmAt));
}

export async function sendAlerts(
  env: PushEnv,
  snapshot: DashboardSnapshot,
  now = new Date(),
  notifier: Notifier<WebPushTarget> = notifierFor(env),
  cfg: AlertConfig = DEFAULT_CONFIG,
) {
  const readings: Observation[] = [
    ...(snapshot.runner?.feeds.flood?.items ?? []),
    ...(snapshot.runner?.feeds.rain?.items ?? []),
    ...(snapshot.runner?.feeds.waterlevel?.items ?? []),
    ...(snapshot.edge?.feeds.pm25?.items ?? []),
  ];
  const byDistrict = districtAlerts(readings, DISTRICTS, cfg, now);
  const quakes: Earthquake[] = mergeQuakes(snapshot.edge?.feeds.quakesTmd?.items ?? [], snapshot.edge?.feeds.quakesUsgs?.items ?? [], cfg);
  // Widest limit anyone can pick, so a quake only some people asked for still reaches them.
  const loosest = loosestQuakeLimit(cfg);
  const quakeCandidates = quakes.length ? DISTRICTS.flatMap((d) => quakeAlerts(quakes, d, cfg, now, loosest)) : [];

  const withAlerts = [...byDistrict].filter(([, list]) => list.length).map(([id]) => id);
  const subs = await subscriptionsIn(env.PUSH_DB, quakeCandidates.length ? 'all' : withAlerts);
  const since = new Date(now.getTime() - sentRetentionMs(cfg));
  const budget = sendBudget(cfg);
  const stats = { subscribers: subs.length, sent: 0, gone: 0, failed: 0, transient: 0, unauthorized: 0, attempts: 0, stoppedEarly: false };

  const queue = subs
    .map((sub) => {
      const district = DISTRICTS.find((d) => d.properties.id === sub.district);
      const prefs = JSON.parse(sub.prefs || '{}') as SubscriptionPrefs;
      const candidates = wanted([...(byDistrict.get(sub.district) ?? []), ...(district ? quakeAlerts(quakes, district, cfg, now, quakeLimitFor(sub, cfg)) : [])], prefs);
      return { sub, candidates };
    })
    .filter((q) => q.candidates.length);

  let sentBy = new Map<string, Map<string, string>>();
  for (const [i, { sub, candidates }] of queue.entries()) {
    if (stats.attempts >= budget) stats.stoppedEarly = true;
    if (stats.stoppedEarly) break;
    // Loaded a chunk at a time as the loop reaches it: a run that stops at the send budget skips the rest.
    if (i % SENT_IDS_PER_QUERY === 0) {
      sentBy = await sentSinceMany(env.PUSH_DB, queue.slice(i, i + SENT_IDS_PER_QUERY).map((q) => q.sub.id), since);
    }
    const fresh = alertsDue(candidates, sentBy.get(sub.id) ?? new Map(), cfg, now);
    const writes = [];
    let last: DeliveryResult | null = null;
    for (const alert of fresh) {
      // Every attempt is a subrequest whatever its outcome, so failures count toward the budget too.
      if (stats.attempts >= budget) {
        stats.stoppedEarly = true;
        break;
      }
      stats.attempts++;
      last = await notifier.send(sub, messageFor(alert, sub, env.SITE_URL), cfg.push.ttlSeconds);
      if (last === 'overLimit') stats.stoppedEarly = true;
      if (last !== 'sent') break; // the rest would fail the same way
      writes.push(markSent(env.PUSH_DB, sub.id, alert.key, now));
      stats.sent++;
    }
    if (last === 'gone') stats.gone++;
    else if (last === 'failed') stats.failed++;
    else if (last === 'unauthorized') stats.unauthorized++;
    else if (last === 'transient' || last === 'overLimit') stats.transient++;
    if (writes.length) await env.PUSH_DB.batch(writes);
    if (last) await recordDelivery(env.PUSH_DB, sub, last);
    // Every push service refusing us means our keys are wrong; more attempts would only burn subrequests.
    if (stats.attempts >= AUTH_STOP_AFTER && stats.unauthorized === stats.attempts) {
      console.log('push auth rejected — check VAPID keys', JSON.stringify({ attempts: stats.attempts }));
      stats.stoppedEarly = true;
    }
  }
  await forgetOldSends(env.PUSH_DB, since);
  await pruneRateLimits(env.PUSH_DB, now);
  return stats;
}
