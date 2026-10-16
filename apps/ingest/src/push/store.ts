import type { PushKind } from '@hw/core';
import type { DeliveryResult } from './notifier';

export interface SubscriptionPrefs {
  kinds?: PushKind[];
  pm25At?: number;
}

export interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  lang: 'th' | 'en';
  district: string;
  subdistrict: string | null;
  prefs: string;
  /** null = central quake tiers. */
  quake_min_mag: number | null;
  quake_max_km: number | null;
  /** Consecutive failed deliveries (migration 0004). */
  failures?: number;
  /** ISO time; the push queue serves oldest first. */
  updated_at?: string;
}

/** Consecutive definitive failures (4xx other than 404/408/410/429) before a subscription is dropped; push services return 404/410 for ones that are gone for sure. */
export const MAX_STRIKES = 3;
/** Rows loaded per push run, healthiest and oldest first, so a flood of new junk rows queues behind real users. */
export const MAX_ROWS_PER_RUN = 5000;

export async function subscriptionId(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function upsertSubscription(
  db: D1Database,
  sub: Omit<SubscriptionRow, 'id' | 'prefs' | 'failures'> & { prefs: SubscriptionPrefs },
  now: Date,
): Promise<string> {
  const id = await subscriptionId(sub.endpoint);
  await db
    .prepare(
      `INSERT INTO subscriptions (id, endpoint, p256dh, auth, lang, district, subdistrict, prefs, quake_min_mag, quake_max_km, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?10, ?11, ?9, ?9)
       ON CONFLICT(id) DO UPDATE SET p256dh = ?3, auth = ?4, lang = ?5, district = ?6, subdistrict = ?7, prefs = ?8,
         quake_min_mag = ?10, quake_max_km = ?11, failures = 0, updated_at = ?9`,
    )
    .bind(
      id,
      sub.endpoint,
      sub.p256dh,
      sub.auth,
      sub.lang,
      sub.district,
      sub.subdistrict,
      JSON.stringify(sub.prefs),
      now.toISOString(),
      sub.quake_min_mag,
      sub.quake_max_km,
    )
    .run();
  return id;
}

export async function deleteSubscription(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM sent WHERE subscription_id = ?1').bind(id),
    db.prepare('DELETE FROM subscriptions WHERE id = ?1').bind(id),
  ]);
}

export async function getSubscription(db: D1Database, id: string): Promise<SubscriptionRow | null> {
  return db.prepare('SELECT * FROM subscriptions WHERE id = ?1').bind(id).first<SubscriptionRow>();
}

/** D1 refuses more than 100 bound parameters per query; 90 leaves headroom for future filters. */
export const MAX_BIND_PARAMS = 90;

// Same order as the SQL: ISO strings compare correctly as plain strings.
const byHealthThenAge = (a: SubscriptionRow, b: SubscriptionRow) =>
  (a.failures ?? 0) - (b.failures ?? 0) || ((a.updated_at ?? '') < (b.updated_at ?? '') ? -1 : (a.updated_at ?? '') > (b.updated_at ?? '') ? 1 : 0);

/**
 * With 928 districts a storm can put hundreds in alert at once, so the IN list goes out in chunks of
 * MAX_BIND_PARAMS; each chunk is already limited, then the merge is re-sorted and limited again.
 */
export async function subscriptionsIn(db: D1Database, districts: string[] | 'all', limit = MAX_ROWS_PER_RUN): Promise<SubscriptionRow[]> {
  const max = Math.max(1, Math.floor(limit));
  const order = `ORDER BY failures ASC, updated_at ASC LIMIT ${max}`;
  if (districts === 'all') return (await db.prepare(`SELECT * FROM subscriptions ${order}`).all<SubscriptionRow>()).results;
  const unique = [...new Set(districts)];
  if (!unique.length) return [];
  const rows: SubscriptionRow[] = [];
  for (let i = 0; i < unique.length; i += MAX_BIND_PARAMS) {
    const chunk = unique.slice(i, i + MAX_BIND_PARAMS);
    const marks = chunk.map((_, j) => `?${j + 1}`).join(',');
    rows.push(...(await db.prepare(`SELECT * FROM subscriptions WHERE district IN (${marks}) ${order}`).bind(...chunk).all<SubscriptionRow>()).results);
  }
  // One chunk needs no merge, and keeps the database's own order exactly as before.
  return unique.length <= MAX_BIND_PARAMS ? rows : rows.sort(byHealthThenAge).slice(0, max);
}

export type StrikeAction = 'delete' | 'strike' | 'reset' | 'none';

export function strikeAction(failures: number, result: DeliveryResult): StrikeAction {
  if (result === 'gone') return 'delete';
  if (result === 'failed') return failures + 1 >= MAX_STRIKES ? 'delete' : 'strike';
  // Our side ran out of subrequests or the service was briefly down: says nothing about the subscription.
  if (result === 'transient' || result === 'unauthorized' || result === 'overLimit') return 'none';
  return failures > 0 ? 'reset' : 'none';
}

/** Applies a delivery result to the row; returns the action taken. */
export async function recordDelivery(db: D1Database, sub: Pick<SubscriptionRow, 'id' | 'failures'>, result: DeliveryResult): Promise<StrikeAction> {
  const action = strikeAction(sub.failures ?? 0, result);
  if (action === 'delete') await deleteSubscription(db, sub.id);
  else if (action === 'strike') await db.prepare('UPDATE subscriptions SET failures = failures + 1 WHERE id = ?1').bind(sub.id).run();
  else if (action === 'reset') await db.prepare('UPDATE subscriptions SET failures = 0 WHERE id = ?1').bind(sub.id).run();
  return action;
}

export async function sentSince(db: D1Database, id: string, since: Date): Promise<Map<string, string>> {
  const rows = await db
    .prepare('SELECT alert_key, sent_at FROM sent WHERE subscription_id = ?1 AND sent_at >= ?2')
    .bind(id, since.toISOString())
    .all<{ alert_key: string; sent_at: string }>();
  return new Map(rows.results.map((r) => [r.alert_key, r.sent_at]));
}

/** D1 binds at most 100 parameters per query; one goes to `since`. */
export const SENT_IDS_PER_QUERY = 99;

/** sentSince for many subscriptions in one query per SENT_IDS_PER_QUERY ids; every id gets a map, empty if nothing was sent. */
export async function sentSinceMany(db: D1Database, ids: string[], since: Date): Promise<Map<string, Map<string, string>>> {
  const out = new Map(ids.map((id) => [id, new Map<string, string>()]));
  for (let i = 0; i < ids.length; i += SENT_IDS_PER_QUERY) {
    const chunk = ids.slice(i, i + SENT_IDS_PER_QUERY);
    const marks = chunk.map((_, j) => `?${j + 2}`).join(',');
    const rows = await db
      .prepare(`SELECT subscription_id, alert_key, sent_at FROM sent WHERE sent_at >= ?1 AND subscription_id IN (${marks})`)
      .bind(since.toISOString(), ...chunk)
      .all<{ subscription_id: string; alert_key: string; sent_at: string }>();
    for (const r of rows.results) out.get(r.subscription_id)?.set(r.alert_key, r.sent_at);
  }
  return out;
}

export function markSent(db: D1Database, id: string, key: string, now: Date) {
  return db
    .prepare('INSERT INTO sent (subscription_id, alert_key, sent_at) VALUES (?1, ?2, ?3) ON CONFLICT DO UPDATE SET sent_at = ?3')
    .bind(id, key, now.toISOString());
}

export async function forgetOldSends(db: D1Database, before: Date): Promise<void> {
  await db.prepare('DELETE FROM sent WHERE sent_at < ?1').bind(before.toISOString()).run();
}
