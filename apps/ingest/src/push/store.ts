import type { PushKind } from '@hw/core';

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
}

export async function subscriptionId(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function upsertSubscription(
  db: D1Database,
  sub: Omit<SubscriptionRow, 'id' | 'prefs'> & { prefs: SubscriptionPrefs },
  now: Date,
): Promise<string> {
  const id = await subscriptionId(sub.endpoint);
  await db
    .prepare(
      `INSERT INTO subscriptions (id, endpoint, p256dh, auth, lang, district, subdistrict, prefs, quake_min_mag, quake_max_km, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?10, ?11, ?9, ?9)
       ON CONFLICT(id) DO UPDATE SET p256dh = ?3, auth = ?4, lang = ?5, district = ?6, subdistrict = ?7, prefs = ?8,
         quake_min_mag = ?10, quake_max_km = ?11, updated_at = ?9`,
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

export async function subscriptionsIn(db: D1Database, districts: string[] | 'all'): Promise<SubscriptionRow[]> {
  if (districts === 'all') return (await db.prepare('SELECT * FROM subscriptions').all<SubscriptionRow>()).results;
  if (!districts.length) return [];
  const marks = districts.map((_, i) => `?${i + 1}`).join(',');
  return (await db.prepare(`SELECT * FROM subscriptions WHERE district IN (${marks})`).bind(...districts).all<SubscriptionRow>()).results;
}

export async function sentSince(db: D1Database, id: string, since: Date): Promise<Map<string, string>> {
  const rows = await db
    .prepare('SELECT alert_key, sent_at FROM sent WHERE subscription_id = ?1 AND sent_at >= ?2')
    .bind(id, since.toISOString())
    .all<{ alert_key: string; sent_at: string }>();
  return new Map(rows.results.map((r) => [r.alert_key, r.sent_at]));
}

export function markSent(db: D1Database, id: string, key: string, now: Date) {
  return db
    .prepare('INSERT INTO sent (subscription_id, alert_key, sent_at) VALUES (?1, ?2, ?3) ON CONFLICT DO UPDATE SET sent_at = ?3')
    .bind(id, key, now.toISOString());
}

export async function forgetOldSends(db: D1Database, before: Date): Promise<void> {
  await db.prepare('DELETE FROM sent WHERE sent_at < ?1').bind(before.toISOString()).run();
}
