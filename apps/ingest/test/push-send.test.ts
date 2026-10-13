import { DEFAULT_CONFIG, mergeConfig, type DashboardSnapshot } from '@hw/core';
import { describe, expect, it, vi } from 'vitest';
import type { DeliveryResult, Notifier, WebPushTarget } from '../src/push/notifier';
import { isSubrequestLimit, resultFor } from '../src/push/notifier';
import { AUTH_STOP_AFTER, OTHER_FETCHES_PER_RUN, sendAlerts, sendBudget, type PushEnv } from '../src/push/run';
import { SENT_IDS_PER_QUERY, strikeAction, type SubscriptionRow } from '../src/push/store';

const now = new Date('2026-10-05T10:00:00Z');
// Inside Phra Nakhon (TH1001).
const inside = { lat: 13.755, lng: 100.5 };

const reading = (id: string, kind: 'pm25' | 'flood', value: number) => ({
  id,
  kind,
  source: kind === 'pm25' ? 'air4thai' : 'bma-flood',
  name: { th: id, en: id },
  location: inside,
  observedAt: '2026-10-05T09:40:00Z',
  value,
  unit: kind === 'pm25' ? 'µg/m³' : 'cm',
  severity: 'danger',
});
const feed = (source: string, items: unknown[]) => ({ source, fetchedAt: '2026-10-05T09:50:00Z', ok: true, items });

/** pm25 alone gives every TH1001 subscriber one alert; with flood, two. */
const snapshot = (withFlood = false) =>
  ({
    edge: { updatedAt: '2026-10-05T09:50:00Z', feeds: { pm25: feed('air4thai', [reading('pm', 'pm25', 120)]) } },
    runner: withFlood ? { updatedAt: '2026-10-05T09:50:00Z', feeds: { flood: feed('bma-flood', [reading('fl', 'flood', 45)]) } } : null,
  }) as unknown as DashboardSnapshot;

const sub = (i: number, failures = 0): SubscriptionRow => ({
  id: `s${i}`,
  endpoint: `https://fcm.googleapis.com/fcm/send/${i}`,
  p256dh: 'k',
  auth: 'a',
  lang: 'en',
  district: 'TH1001',
  subdistrict: null,
  prefs: '{}',
  quake_min_mag: null,
  quake_max_km: null,
  failures,
});

/** Just enough D1 for sendAlerts: serves the subscriber list and `sent` rows, logs every write and counts every query. */
function fakeDb(rows: SubscriptionRow[]) {
  const writes: { sql: string; args: unknown[] }[] = [];
  const sent = new Map<string, Map<string, string>>();
  let queries = 0;
  const reads: string[] = [];
  const select = (sql: string, args: unknown[]) => {
    reads.push(sql);
    if (sql.includes('FROM subscriptions')) return rows;
    if (!sql.includes('FROM sent')) return [];
    const [since = '', ...ids] = args as string[];
    return ids.flatMap((id) => [...(sent.get(id) ?? [])].filter(([, at]) => at >= since).map(([alert_key, sent_at]) => ({ subscription_id: id, alert_key, sent_at })));
  };
  const write = (sql: string, args: unknown[]) => {
    writes.push({ sql, args });
    if (sql.startsWith('INSERT INTO sent')) {
      const [id, key, at] = args as [string, string, string];
      sent.set(id, (sent.get(id) ?? new Map()).set(key, at));
    }
  };
  const stmt = (sql: string, args: unknown[] = []) => ({
    sql,
    args,
    bind: (...a: unknown[]) => stmt(sql, a),
    all: async () => {
      queries++;
      return { results: select(sql, args) };
    },
    first: async () => {
      queries++;
      return null;
    },
    run: async () => {
      queries++;
      write(sql, args);
      return {};
    },
  });
  const db = {
    prepare: (sql: string) => stmt(sql),
    batch: async (list: { sql: string; args: unknown[] }[]) => {
      queries += list.length;
      list.forEach((s) => write(s.sql, s.args));
      return [];
    },
  };
  const touched = (needle: string) => writes.filter((w) => w.sql.includes(needle)).map((w) => w.args[0]);
  return { db: db as unknown as D1Database, writes, touched, reads, queries: () => queries };
}

/** Answers each send from `plan` by call number (default 'sent'); a function may throw like fetch does. */
function fakeNotifier(plan: (n: number, target: WebPushTarget) => DeliveryResult = () => 'sent') {
  const calls: string[] = [];
  const notifier: Notifier<WebPushTarget> = {
    channel: 'test',
    send: async (target) => {
      calls.push(target.endpoint);
      return plan(calls.length, target);
    },
  };
  return { notifier, calls };
}

const envFor = (db: D1Database) => ({ PUSH_DB: db, VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', VAPID_SUBJECT: '', SITE_URL: 'https://x' }) as PushEnv;

describe('sendBudget', () => {
  it('fits the Free plan subrequest cap after the cron’s own fetches', () => {
    expect(OTHER_FETCHES_PER_RUN + sendBudget(DEFAULT_CONFIG)).toBeLessThanOrEqual(DEFAULT_CONFIG.push.maxSubrequests);
    expect(DEFAULT_CONFIG.push.maxSubrequests).toBeLessThan(50);
  });
  it('never exceeds maxPerRun', () => {
    expect(sendBudget(mergeConfig({ push: { maxPerRun: 3, maxSubrequests: 10_000 } }))).toBe(3);
  });
});

describe('sendAlerts', () => {
  it('stops at the per-run budget', async () => {
    const { db } = fakeDb(Array.from({ length: 100 }, (_, i) => sub(i)));
    const { notifier, calls } = fakeNotifier();
    const stats = await sendAlerts(envFor(db), snapshot(), now, notifier);
    expect(calls).toHaveLength(sendBudget(DEFAULT_CONFIG));
    expect(stats).toMatchObject({ sent: sendBudget(DEFAULT_CONFIG), stoppedEarly: true });
  });

  it('counts every attempt, not just successes, toward the cap', async () => {
    const cfg = mergeConfig({ push: { maxPerRun: 4 } });
    const { db, touched } = fakeDb(Array.from({ length: 10 }, (_, i) => sub(i)));
    const { notifier, calls } = fakeNotifier((n) => (n % 2 ? 'failed' : 'sent'));
    const stats = await sendAlerts(envFor(db), snapshot(), now, notifier, cfg);
    expect(calls).toHaveLength(4);
    expect(stats).toMatchObject({ sent: 2, failed: 2 });
    expect(touched('failures = failures + 1')).toEqual(['s0', 's2']);
  });

  it('counts each alert of a subscriber as its own request', async () => {
    const cfg = mergeConfig({ push: { maxPerRun: 3 } });
    const { db } = fakeDb(Array.from({ length: 5 }, (_, i) => sub(i)));
    const { notifier, calls } = fakeNotifier();
    await sendAlerts(envFor(db), snapshot(true), now, notifier, cfg);
    expect(calls).toEqual(['https://fcm.googleapis.com/fcm/send/0', 'https://fcm.googleapis.com/fcm/send/0', 'https://fcm.googleapis.com/fcm/send/1']);
  });

  it('does not strike or delete on transient errors', async () => {
    const { db, touched } = fakeDb([sub(0, 2), sub(1, 2)]);
    const { notifier, calls } = fakeNotifier(() => 'transient');
    const stats = await sendAlerts(envFor(db), snapshot(), now, notifier);
    expect(calls).toHaveLength(2);
    expect(stats).toMatchObject({ transient: 2, failed: 0, gone: 0 });
    expect(touched('UPDATE subscriptions')).toEqual([]);
    expect(touched('DELETE FROM subscriptions')).toEqual([]);
  });

  it('stops the run without strikes when the subrequest cap is hit', async () => {
    const { db, touched } = fakeDb(Array.from({ length: 5 }, (_, i) => sub(i, 2)));
    const { notifier, calls } = fakeNotifier((n) => (n >= 2 ? 'overLimit' : 'sent'));
    const stats = await sendAlerts(envFor(db), snapshot(), now, notifier);
    expect(calls).toHaveLength(2);
    expect(stats).toMatchObject({ sent: 1, stoppedEarly: true });
    expect(touched('failures = failures + 1')).toEqual([]);
    expect(touched('DELETE FROM subscriptions')).toEqual([]);
    expect(touched('failures = 0')).toEqual(['s0']);
  });

  it('deletes a subscription the push service says is gone', async () => {
    const { db, touched } = fakeDb([sub(0), sub(1)]);
    const { notifier } = fakeNotifier((n) => (n === 1 ? 'gone' : 'sent'));
    const stats = await sendAlerts(envFor(db), snapshot(), now, notifier);
    expect(stats).toMatchObject({ gone: 1, sent: 1 });
    expect(touched('DELETE FROM subscriptions')).toEqual(['s0']);
  });
});

describe('sendAlerts with rejected VAPID credentials', () => {
  it('stops the run without strikes when every attempt is 401/403', async () => {
    const { db, touched } = fakeDb(Array.from({ length: 10 }, (_, i) => sub(i, 2)));
    const { notifier, calls } = fakeNotifier(() => 'unauthorized');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const stats = await sendAlerts(envFor(db), snapshot(), now, notifier);
    expect(calls).toHaveLength(AUTH_STOP_AFTER);
    expect(stats).toMatchObject({ unauthorized: AUTH_STOP_AFTER, failed: 0, gone: 0, stoppedEarly: true });
    expect(touched('UPDATE subscriptions')).toEqual([]);
    expect(touched('DELETE FROM subscriptions')).toEqual([]);
    expect(log.mock.calls.some(([line]) => String(line).includes('check VAPID keys'))).toBe(true);
    log.mockRestore();
  });

  it('keeps going when some sends still succeed', async () => {
    const { db, touched } = fakeDb(Array.from({ length: 6 }, (_, i) => sub(i, 2)));
    const { notifier, calls } = fakeNotifier((n) => (n === 1 ? 'sent' : 'unauthorized'));
    const stats = await sendAlerts(envFor(db), snapshot(), now, notifier);
    expect(calls).toHaveLength(6);
    expect(stats).toMatchObject({ sent: 1, unauthorized: 5, stoppedEarly: false });
    expect(touched('DELETE FROM subscriptions')).toEqual([]);
  });
});

describe('sendAlerts D1 usage', () => {
  const roomy = mergeConfig({ push: { maxPerRun: 10_000, maxSubrequests: 10_000 } });

  it('loads recent sends in one query per chunk of subscribers and keeps the cooldown', async () => {
    const n = 100;
    const { db, queries } = fakeDb(Array.from({ length: n }, (_, i) => sub(i)));
    const first = fakeNotifier();
    await sendAlerts(envFor(db), snapshot(), now, first.notifier, roomy);
    expect(first.calls).toHaveLength(n);

    const before = queries();
    const again = fakeNotifier();
    const stats = await sendAlerts(envFor(db), snapshot(), new Date(now.getTime() + 60_000), again.notifier, roomy);
    expect(again.calls).toHaveLength(0);
    expect(stats.sent).toBe(0);
    // subscriber list + forgetOldSends + pruneRateLimits, plus the sent lookups.
    expect(queries() - before).toBeLessThanOrEqual(Math.ceil(n / SENT_IDS_PER_QUERY) + 3);
    expect(queries() - before).toBeLessThanOrEqual(Math.ceil(n / 100) + 4);
  });

  it('skips the sent lookup for chunks the send budget never reaches', async () => {
    const { db, reads } = fakeDb(Array.from({ length: 300 }, (_, i) => sub(i)));
    await sendAlerts(envFor(db), snapshot(), now, fakeNotifier().notifier);
    expect(reads.filter((sql) => sql.includes('FROM sent'))).toHaveLength(1);
  });
});

describe('resultFor', () => {
  it('only treats definitive push-service answers as about the subscription', () => {
    expect(resultFor(201)).toBe('sent');
    expect(resultFor(404)).toBe('gone');
    expect(resultFor(410)).toBe('gone');
    expect(resultFor(400)).toBe('failed');
    expect(resultFor(413)).toBe('failed');
    expect(resultFor(401)).toBe('unauthorized');
    expect(resultFor(403)).toBe('unauthorized');
    expect(strikeAction(2, 'unauthorized')).toBe('none');
    for (const status of [408, 429, 500, 502, 503]) expect(resultFor(status), String(status)).toBe('transient');
  });
  it('recognises the Workers subrequest-limit error', () => {
    expect(isSubrequestLimit(new Error('Too many subrequests.'))).toBe(true);
    expect(isSubrequestLimit(new TypeError('Network connection lost.'))).toBe(false);
  });
});
