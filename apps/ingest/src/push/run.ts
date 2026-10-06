import {
  DEFAULT_CONFIG,
  districtAlerts,
  loosestQuakeLimit,
  mergeQuakes,
  quakeAlerts,
  type Alert,
  type DashboardSnapshot,
  type Earthquake,
  type Observation,
  type ZoneFeature,
} from '@hw/core';
import districtsFile from '../../../web/public/geo/districts.json';
import { webPushNotifier, type OutgoingMessage } from './notifier';
import { quakeLimitFor } from './prefs';
import { deleteSubscription, forgetOldSends, markSent, recentlySent, subscriptionsIn, type SubscriptionPrefs, type SubscriptionRow } from './store';

export const DISTRICTS = (districtsFile as unknown as { features: ZoneFeature[] }).features;
export const DISTRICT_IDS = new Set(DISTRICTS.map((d) => d.properties.id));

export interface PushEnv {
  PUSH_DB: D1Database;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  SITE_URL: string;
}

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

export async function sendAlerts(env: PushEnv, snapshot: DashboardSnapshot, now = new Date()) {
  const cfg = DEFAULT_CONFIG;
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
  const notifier = notifierFor(env);
  const since = new Date(now.getTime() - cfg.push.cooldownHours * 3_600_000);
  const stats = { subscribers: subs.length, sent: 0, gone: 0, failed: 0 };

  for (const sub of subs) {
    if (stats.sent >= cfg.push.maxPerRun) break;
    const district = DISTRICTS.find((d) => d.properties.id === sub.district);
    const prefs = JSON.parse(sub.prefs || '{}') as SubscriptionPrefs;
    const candidates = wanted([...(byDistrict.get(sub.district) ?? []), ...(district ? quakeAlerts(quakes, district, cfg, now, quakeLimitFor(sub, cfg)) : [])], prefs);
    if (!candidates.length) continue;
    const already = await recentlySent(env.PUSH_DB, sub.id, since);
    const fresh = candidates.filter((a) => !already.has(a.key));
    const writes = [];
    for (const alert of fresh) {
      const result = await notifier.send(sub, messageFor(alert, sub, env.SITE_URL), cfg.push.ttlSeconds);
      if (result === 'gone') {
        await deleteSubscription(env.PUSH_DB, sub.id);
        stats.gone++;
        break;
      }
      if (result === 'sent') {
        writes.push(markSent(env.PUSH_DB, sub.id, alert.key, now));
        stats.sent++;
      } else stats.failed++;
    }
    if (writes.length) await env.PUSH_DB.batch(writes);
  }
  await forgetOldSends(env.PUSH_DB, new Date(now.getTime() - 2 * cfg.push.cooldownHours * 3_600_000));
  return stats;
}
