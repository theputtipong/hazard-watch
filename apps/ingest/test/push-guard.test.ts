import { describe, expect, it } from 'vitest';
import { ipBucket, isValidPushKeys, MAX_BODY_BYTES, parseEndpointBody, parseSubscribeBody, rateLimit, RATE_LIMITS, readJsonBody } from '../src/push/guard';
import { isPushEndpoint } from '../src/push/notifier';

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const point = (len = 65, first = 4) => b64url(Uint8Array.from({ length: len }, (_, i) => (i === 0 ? first : i)));
const secret = (len = 16) => b64url(Uint8Array.from({ length: len }, (_, i) => i + 1));

const good = () => ({
  subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc:123', expirationTime: null, keys: { p256dh: point(), auth: secret() } },
  lang: 'en',
  district: 'TH1001',
  subdistrict: 'TH100101',
  prefs: { kinds: ['flood', 'quake'], pm25At: 50, quakeMinMag: 5, quakeMaxKm: 500 },
});

describe('isPushEndpoint', () => {
  it('accepts the real push services', () => {
    for (const url of [
      'https://fcm.googleapis.com/fcm/send/x',
      'https://updates.push.services.mozilla.com/wpush/v2/x',
      'https://web.push.apple.com/x',
      'https://wns2-par02p.notify.windows.com/w/?token=x',
    ]) expect(isPushEndpoint(url), url).toBe(true);
  });
  it('rejects lookalikes, other google hosts and non-https', () => {
    for (const url of [
      'https://fcm.googleapis.com.evil.com/x',
      'https://evilfcm.googleapis.com/x',
      'https://storage.googleapis.com/bucket/x',
      'https://evil.mozilla.com/x',
      'https://push.apple.com.evil.com/x',
      'https://evilnotify.windows.com/x',
      'http://fcm.googleapis.com/fcm/send/x',
      'https://fcm.googleapis.com:8443/fcm/send/x',
      'https://user:pw@fcm.googleapis.com/fcm/send/x',
      'not a url',
    ]) expect(isPushEndpoint(url), url).toBe(false);
  });
});

describe('isValidPushKeys', () => {
  it('needs a 65-byte uncompressed point and a 16-byte secret', () => {
    expect(isValidPushKeys(point(), secret())).toBe(true);
    expect(isValidPushKeys(point() + '=', secret() + '==')).toBe(true);
    expect(isValidPushKeys(point(64), secret())).toBe(false);
    expect(isValidPushKeys(point(66), secret())).toBe(false);
    expect(isValidPushKeys(point(65, 2), secret())).toBe(false);
    expect(isValidPushKeys(point(), secret(15))).toBe(false);
    expect(isValidPushKeys(point(), secret(17))).toBe(false);
    expect(isValidPushKeys(point().replace(/.$/, '*'), secret())).toBe(false);
    expect(isValidPushKeys(42, secret())).toBe(false);
  });
});

describe('parseSubscribeBody', () => {
  it('accepts what the web app sends', () => {
    const out = parseSubscribeBody(good());
    expect(out).toEqual({
      ok: true,
      value: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc:123',
        p256dh: point(),
        auth: secret(),
        lang: 'en',
        district: 'TH1001',
        subdistrict: 'TH100101',
        prefs: { kinds: ['flood', 'quake'], pm25At: 50 },
        quake_min_mag: 5,
        quake_max_km: 500,
      },
    });
  });
  it('rejects a lookalike host and bad keys', () => {
    const body = good();
    body.subscription.endpoint = 'https://fcm.googleapis.com.evil.com/fcm/send/x';
    expect(parseSubscribeBody(body)).toMatchObject({ ok: false, status: 400, error: 'invalid subscription' });
    const short = good();
    short.subscription.keys.p256dh = point(33);
    expect(parseSubscribeBody(short)).toMatchObject({ ok: false, error: 'invalid subscription' });
    const auth = good();
    auth.subscription.keys.auth = 'x';
    expect(parseSubscribeBody(auth)).toMatchObject({ ok: false, error: 'invalid subscription' });
    expect(parseSubscribeBody(null)).toMatchObject({ ok: false });
    expect(parseSubscribeBody({ subscription: 'nope' })).toMatchObject({ ok: false });
  });
  it('rejects an unknown district', () => {
    expect(parseSubscribeBody({ ...good(), district: 'TH9999' })).toMatchObject({ ok: false, error: 'unknown district' });
    expect(parseSubscribeBody({ ...good(), district: ['TH1001'] })).toMatchObject({ ok: false, error: 'unknown district' });
  });
  it('drops a subdistrict that is unknown, too long or in another district', () => {
    for (const subdistrict of ['TH100199', 'TH1001' + 'x'.repeat(5000), 'TH100201', 42, null]) {
      const out = parseSubscribeBody({ ...good(), subdistrict });
      expect(out.ok && out.value.subdistrict).toBeNull();
    }
  });
});

describe('parseEndpointBody', () => {
  it('needs a bounded endpoint string', () => {
    expect(parseEndpointBody({ endpoint: 'https://fcm.googleapis.com/x' })).toEqual({ ok: true, value: 'https://fcm.googleapis.com/x' });
    expect(parseEndpointBody({ endpoint: 'x'.repeat(2000) })).toMatchObject({ ok: false });
    expect(parseEndpointBody({})).toMatchObject({ ok: false });
  });
});

describe('readJsonBody', () => {
  const post = (body: BodyInit, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
    new Request('https://x/v1/push/subscribe', { method: 'POST', body, headers });
  it('parses a small JSON body', async () => {
    expect(await readJsonBody(post(JSON.stringify(good())))).toEqual({ ok: true, value: good() });
  });
  it('rejects an oversized body even without content-length', async () => {
    const big = JSON.stringify({ pad: 'x'.repeat(MAX_BODY_BYTES) });
    expect(await readJsonBody(post(big, { 'content-type': 'application/json', 'content-length': String(big.length) }))).toMatchObject({ status: 413 });
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(big));
        c.close();
      },
    });
    const req = new Request('https://x', { method: 'POST', body: stream, headers: { 'content-type': 'application/json' }, duplex: 'half' } as RequestInit);
    expect(await readJsonBody(req)).toMatchObject({ status: 413 });
  });
  it('rejects other content types and broken JSON', async () => {
    expect(await readJsonBody(post('{}', { 'content-type': 'text/plain' }))).toMatchObject({ status: 415 });
    expect(await readJsonBody(post('{nope'))).toMatchObject({ status: 400 });
  });
});

describe('rateLimit', () => {
  // Minimal stand-in for the D1 upsert: same fixed-window semantics as the SQL.
  const fakeDb = () => {
    const rows = new Map<string, { window_start: number; hits: number }>();
    const db = {
      prepare: () => ({
        bind: (key: string, windowStart: number) => ({
          first: async () => {
            const row = rows.get(key);
            const hits = row && row.window_start === windowStart ? row.hits + 1 : 1;
            rows.set(key, { window_start: windowStart, hits });
            return { hits };
          },
        }),
      }),
    };
    return db as unknown as D1Database;
  };
  it('blocks after the per-action limit and resets in the next window', async () => {
    const env = { PUSH_DB: fakeDb() };
    const t0 = new Date('2026-10-13T00:00:00Z');
    for (let i = 0; i < RATE_LIMITS.test; i++) expect((await rateLimit(env, '1.2.3.4', 'test', t0)).ok).toBe(true);
    const blocked = await rateLimit(env, '1.2.3.4', 'test', t0);
    expect(blocked).toEqual({ ok: false, retryAfter: 600 });
    expect((await rateLimit(env, '5.6.7.8', 'test', t0)).ok).toBe(true);
    expect((await rateLimit(env, '1.2.3.4', 'subscribe', t0)).ok).toBe(true);
    expect((await rateLimit(env, '1.2.3.4', 'test', new Date(t0.getTime() + 600_000))).ok).toBe(true);
  });
  it('fails open when the database errors', async () => {
    const env = { PUSH_DB: { prepare: () => { throw new Error('D1 down'); } } as unknown as D1Database };
    expect((await rateLimit(env, '1.2.3.4', 'unsubscribe')).ok).toBe(true);
  });
});

describe('ipBucket', () => {
  it('keeps IPv4 as is', () => {
    expect(ipBucket('1.2.3.4')).toBe('1.2.3.4');
    expect(ipBucket('')).toBe('unknown');
  });
  it('groups an IPv6 /64 however it is written', () => {
    const bucket = '2001:db8:0:1::/64';
    for (const ip of ['2001:db8:0:1::1', '2001:0db8:0000:0001:ffff:ffff:ffff:ffff', '2001:DB8:0:1:a:b:c:d', '[2001:db8::1:0:0:0:5]', '2001:db8:0:1::1%eth0'])
      expect(ipBucket(ip), ip).toBe(bucket);
    expect(ipBucket('2001:db8:0:2::1')).not.toBe(bucket);
    expect(ipBucket('::1')).toBe('0:0:0:0::/64');
  });
  it('treats IPv4-mapped IPv6 as the IPv4 address', () => {
    expect(ipBucket('::ffff:1.2.3.4')).toBe('1.2.3.4');
  });
  it('leaves malformed input unbucketed', () => {
    expect(ipBucket('2001:db8::1::2')).toBe('2001:db8::1::2');
    expect(ipBucket('1:2:3:4:5:6:7:8:9')).toBe('1:2:3:4:5:6:7:8:9');
  });
  it('rate-limits a whole /64 together', async () => {
    const rows = new Map<string, number>();
    const db = {
      prepare: () => ({
        bind: (key: string) => ({
          first: async () => {
            rows.set(key, (rows.get(key) ?? 0) + 1);
            return { hits: rows.get(key) };
          },
        }),
      }),
    } as unknown as D1Database;
    const t0 = new Date('2026-10-13T00:00:00Z');
    for (let i = 0; i < RATE_LIMITS.subscribe; i++) await rateLimit({ PUSH_DB: db }, `2001:db8:0:1::${(i + 1).toString(16)}`, 'subscribe', t0);
    expect((await rateLimit({ PUSH_DB: db }, '2001:db8:0:1:dead:beef:0:1', 'subscribe', t0)).ok).toBe(false);
    expect((await rateLimit({ PUSH_DB: db }, '2001:db8:0:2::1', 'subscribe', t0)).ok).toBe(true);
  });
});
