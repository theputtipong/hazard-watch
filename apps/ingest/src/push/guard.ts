import namesFile from '../../../web/public/geo/names.json';
import { isPushEndpoint } from './notifier';
import { cleanPrefs, type IncomingPrefs } from './prefs';
import { DISTRICT_IDS } from '../geo';
import type { SubscriptionPrefs, SubscriptionRow } from './store';

/** A real subscribe body is ~600 bytes; unsubscribe/test bodies are smaller. */
export const MAX_BODY_BYTES = 4096;

// Province ids are 4 chars, district 6, subdistrict 8 (TH + admin codes).
const SUBDISTRICT_IDS = new Set(Object.keys(namesFile as Record<string, unknown>).filter((id) => id.length === 8));

export type Parsed<T> = { ok: true; value: T } | { ok: false; status: 400 | 413 | 415; error: string };

export type NewSubscription = Omit<SubscriptionRow, 'id' | 'prefs' | 'failures'> & { prefs: SubscriptionPrefs };

export async function readJsonBody(req: Request, max = MAX_BODY_BYTES): Promise<Parsed<unknown>> {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return { ok: false, status: 415, error: 'expected application/json' };
  }
  if (Number(req.headers.get('content-length') ?? 0) > max) return { ok: false, status: 413, error: 'payload too large' };
  if (!req.body) return { ok: false, status: 400, error: 'invalid json' };
  // content-length can be absent (chunked), so the cap is enforced on the stream too.
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return { ok: false, status: 413, error: 'payload too large' };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, status: 400, error: 'invalid json' };
  }
}

export function base64UrlBytes(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || value.length > 256 || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
  const plain = value.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (plain.length % 4 === 1) return null;
  try {
    const raw = atob(plain + '='.repeat((4 - (plain.length % 4)) % 4));
    return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

/** p256dh is an uncompressed P-256 point (0x04 || X || Y = 65 bytes); auth is a 16-byte secret (RFC 8291). */
export function isValidPushKeys(p256dh: unknown, auth: unknown): boolean {
  const key = base64UrlBytes(p256dh);
  const secret = base64UrlBytes(auth);
  return key?.length === 65 && key[0] === 0x04 && secret?.length === 16;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates the body the web app posts to /v1/push/subscribe ({ subscription: PushSubscription.toJSON(), lang, district, subdistrict, prefs }). */
export function parseSubscribeBody(raw: unknown): Parsed<NewSubscription> {
  const body = isObject(raw) ? raw : {};
  const sub = isObject(body.subscription) ? body.subscription : {};
  const keys = isObject(sub.keys) ? sub.keys : {};
  const endpoint = typeof sub.endpoint === 'string' && sub.endpoint.length <= 1024 ? sub.endpoint : '';
  if (!isPushEndpoint(endpoint) || !isValidPushKeys(keys.p256dh, keys.auth)) return { ok: false, status: 400, error: 'invalid subscription' };
  const district = typeof body.district === 'string' ? body.district : '';
  if (!DISTRICT_IDS.has(district)) return { ok: false, status: 400, error: 'unknown district' };
  // Display only: a stale or unknown id is dropped rather than failing the subscribe.
  const subdistrict =
    typeof body.subdistrict === 'string' && SUBDISTRICT_IDS.has(body.subdistrict) && body.subdistrict.startsWith(district) ? body.subdistrict : null;
  const { prefs, quakeMinMag, quakeMaxKm } = cleanPrefs(isObject(body.prefs) ? (body.prefs as IncomingPrefs) : undefined);
  return {
    ok: true,
    value: {
      endpoint,
      p256dh: keys.p256dh as string,
      auth: keys.auth as string,
      lang: body.lang === 'en' ? 'en' : 'th',
      district,
      subdistrict,
      prefs,
      quake_min_mag: quakeMinMag,
      quake_max_km: quakeMaxKm,
    },
  };
}

/** Body of /v1/push/unsubscribe and /v1/push/test. */
export function parseEndpointBody(raw: unknown): Parsed<string> {
  const endpoint = isObject(raw) && typeof raw.endpoint === 'string' ? raw.endpoint : '';
  return endpoint && endpoint.length <= 1024 ? { ok: true, value: endpoint } : { ok: false, status: 400, error: 'endpoint required' };
}

export type PushAction = 'subscribe' | 'unsubscribe' | 'test';

export const RATE_WINDOW_SECONDS = 600;
/** Per IP per window; generous because mobile carriers put many users behind one address (CGNAT). */
export const RATE_LIMITS: Record<PushAction, number> = { subscribe: 20, unsubscribe: 20, test: 10 };

export interface RateResult {
  ok: boolean;
  retryAfter: number;
}

/** The eight 16-bit groups of an IPv6 address, or null if it isn't one. A trailing dotted IPv4 counts as two groups. */
function ipv6Groups(ip: string): number[] | null {
  let text = ip.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const v4 = text.match(/^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4.slice(2).map(Number) as [number, number, number, number];
    if ([a, b, c, d].some((p) => p > 255)) return null;
    text = `${v4[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = '', tail, ...rest] = text.split('::');
  if (rest.length) return null;
  const split = (h: string) => (h ? h.split(':') : []);
  const front = split(head);
  const back = tail === undefined ? [] : split(tail);
  const missing = 8 - front.length - back.length;
  if (tail === undefined ? missing !== 0 : missing < 1) return null;
  const groups = [...front, ...Array<string>(tail === undefined ? 0 : missing).fill('0'), ...back];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/** One bucket per IPv6 /64, since a single host usually gets a whole /64 and can rotate through it; IPv4 as is. */
export function ipBucket(ip: string): string {
  const groups = ipv6Groups(ip);
  if (!groups) return ip.trim() || 'unknown';
  const [g0, g1, g2, g3, g4, g5, g6 = 0, g7 = 0] = groups;
  // IPv4-mapped (::ffff:a.b.c.d) is a plain IPv4 client.
  if (!g0 && !g1 && !g2 && !g3 && !g4 && g5 === 0xffff) return [g6 >> 8, g6 & 255, g7 >> 8, g7 & 255].join('.');
  return `${groups.slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`;
}

async function ipKey(action: PushAction, ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ipBucket(ip)));
  const hex = [...new Uint8Array(digest).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${action}:${hex}`;
}

/** One upsert per request. Fails open: if D1 is down the write that follows fails anyway, and unsubscribe must keep working. */
export async function rateLimit(env: { PUSH_DB: D1Database }, ip: string, action: PushAction, now = new Date()): Promise<RateResult> {
  const nowSec = Math.floor(now.getTime() / 1000);
  const windowStart = nowSec - (nowSec % RATE_WINDOW_SECONDS);
  const retryAfter = windowStart + RATE_WINDOW_SECONDS - nowSec;
  try {
    const row = await env.PUSH_DB.prepare(
      `INSERT INTO rate_limits (key, window_start, hits) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET hits = CASE WHEN window_start = ?2 THEN hits + 1 ELSE 1 END, window_start = ?2
       RETURNING hits`,
    )
      .bind(await ipKey(action, ip), windowStart)
      .first<{ hits: number }>();
    return { ok: (row?.hits ?? 0) <= RATE_LIMITS[action], retryAfter };
  } catch {
    return { ok: true, retryAfter: 0 };
  }
}

export async function pruneRateLimits(db: D1Database, now = new Date()): Promise<void> {
  const cutoff = Math.floor(now.getTime() / 1000) - RATE_WINDOW_SECONDS;
  await db.prepare('DELETE FROM rate_limits WHERE window_start < ?1').bind(cutoff).run();
}
