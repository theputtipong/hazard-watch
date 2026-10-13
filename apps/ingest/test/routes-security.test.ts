import { RADARS, type Observation } from '@hw/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { districtAt } from '../src/area';
import { INGEST } from '../src/config';
import { allowedOrigins, app, takeWeatherQuota, tokenMatches, type Env } from '../src/index';
import { RATE_LIMITS } from '../src/push/guard';
import { isPushHeld, KEYS, writeGroup, type GroupSnapshot } from '../src/store';

type Query = { sql: string; args: unknown[] };

function fakeKv() {
  const data = new Map<string, string | ArrayBuffer>();
  let gets = 0;
  const kv = {
    async get(key: string, type?: string) {
      gets++;
      const v = data.get(key);
      if (v === undefined) return null;
      return type === 'json' ? JSON.parse(v as string) : v;
    },
    async put(key: string, value: string | ArrayBuffer) {
      data.set(key, value);
    },
  };
  return { kv: kv as unknown as KVNamespace, data, gets: () => gets };
}

/** `answer` decides what first() returns for a statement; run()/all() succeed with no rows. */
function fakeDb(answer: (q: Query) => unknown = () => null) {
  const queries: Query[] = [];
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => {
      queries.push({ sql, args });
      return answer({ sql, args });
    },
    run: async () => {
      queries.push({ sql, args });
      return { success: true };
    },
    all: async () => {
      queries.push({ sql, args });
      return { results: [] };
    },
  });
  const db = { prepare: (sql: string) => stmt(sql), batch: async () => [] };
  return { db: db as unknown as D1Database, queries };
}

function fakeCtx() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: { waitUntil: (p: Promise<unknown>) => pending.push(p.catch(() => {})), passThroughOnException() {}, props: {} } as unknown as ExecutionContext,
    pending,
  };
}

const TOKEN = 'secret-token-123';

function makeEnv(over: Partial<Env> = {}) {
  const kv = fakeKv();
  const d1 = fakeDb();
  const env = {
    SNAPSHOTS: kv.kv,
    PUSH_DB: d1.db,
    INGEST_TOKEN: TOKEN,
    ALLOWED_ORIGINS: 'https://hazard.pdouvch.com,http://localhost:3000',
    VAPID_PUBLIC_KEY: 'x',
    VAPID_PRIVATE_KEY: 'x',
    VAPID_SUBJECT: 'https://hazard.pdouvch.com',
    SITE_URL: 'https://hazard.pdouvch.com',
    GITHUB_REPO: 'x/y',
    ...over,
  } as Env;
  return { env, kv, d1 };
}

let cacheStore: Map<string, Response>;
beforeEach(() => {
  cacheStore = new Map();
  (globalThis as unknown as { caches: unknown }).caches = {
    default: {
      match: async (key: string) => cacheStore.get(key)?.clone(),
      put: async (key: string, res: Response) => void cacheStore.set(key, res),
    },
  };
});
afterEach(() => {
  delete (globalThis as unknown as { caches?: unknown }).caches;
});

const BASE = 'https://api.hazard.pdouvch.com';
const auth = { authorization: `Bearer ${TOKEN}` };

describe('INGEST_TOKEN check', () => {
  it('accepts only the exact bearer token', async () => {
    expect(await tokenMatches(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(await tokenMatches(`Bearer ${TOKEN}x`, TOKEN)).toBe(false);
    expect(await tokenMatches(`Bearer ${TOKEN.slice(0, -1)}`, TOKEN)).toBe(false);
    expect(await tokenMatches(TOKEN, TOKEN)).toBe(false);
    expect(await tokenMatches('', TOKEN)).toBe(false);
    expect(await tokenMatches('Bearer ', '')).toBe(false);
    expect(await tokenMatches('Bearer undefined', undefined)).toBe(false);
  });

  it('rejects ingest routes without it, before reading the body', async () => {
    const { env } = makeEnv();
    const { ctx } = fakeCtx();
    for (const [path, method] of [['/ingest/runner', 'POST'], ['/ingest/radar-bundle', 'PUT'], ['/ingest/run-edge', 'POST']] as const) {
      const res = await app.request(path, { method, headers: { authorization: 'Bearer wrong', 'content-length': String(INGEST.maxUploadBytes + 1) } }, env, ctx);
      expect(res.status, path).toBe(401);
    }
  });
});

describe('/ingest/runner', () => {
  const post = (env: Env, ctx: ExecutionContext, body: string, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
    app.request('/ingest/runner', { method: 'POST', headers: { ...auth, ...headers }, body }, env, ctx);

  it('requires application/json and caps the size', async () => {
    const { env } = makeEnv();
    const { ctx } = fakeCtx();
    expect((await post(env, ctx, '{}', { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await post(env, ctx, '{}', { 'content-type': 'application/json', 'content-length': String(INGEST.maxUploadBytes + 1) })).status).toBe(413);
  });

  it('refuses a malformed payload without writing', async () => {
    const { env, kv } = makeEnv();
    const { ctx } = fakeCtx();
    expect((await post(env, ctx, 'not json')).status).toBe(400);
    const res = await post(env, ctx, JSON.stringify({ feeds: { flood: { source: 'bma-flood', ok: true, items: 'x' } } }));
    expect(res.status).toBe(400);
    expect(kv.data.has(KEYS.runner)).toBe(false);
  });

  // One point inside each of 20 real districts.
  const points = (() => {
    const found = new Map<string, { lat: number; lng: number }>();
    for (let lat = 13.6; lat < 13.95 && found.size < 20; lat += 0.02) {
      for (let lng = 100.35; lng < 100.9 && found.size < 20; lng += 0.02) {
        const d = districtAt({ lat, lng });
        if (d && !found.has(d.properties.id)) found.set(d.properties.id, { lat, lng });
      }
    }
    return [...found.values()];
  })();

  const rainFeed = (dangerCount: number) => {
    const now = Date.now();
    const items: Observation[] = points.map((location, i) => ({
      id: `bma-rain:R${i}`,
      kind: 'rain',
      source: 'bma-rain',
      name: { th: `จุด ${i}`, en: `Point ${i}` },
      location,
      observedAt: new Date(now - 5 * 60_000).toISOString(),
      value: i < dangerCount ? 120 : 1,
      unit: 'mm/h',
      severity: i < dangerCount ? 'danger' : 'ok',
    }));
    return { feeds: { rain: { source: 'bma-rain', fetchedAt: new Date(now - 60_000).toISOString(), ok: true, items } } };
  };

  it('stores and pushes a normal upload', async () => {
    expect(points.length).toBe(20);
    const { env, kv } = makeEnv();
    const { ctx, pending } = fakeCtx();
    const res = await post(env, ctx, JSON.stringify(rainFeed(0)));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, feeds: ['rain'], dropped: 0, held: false });
    expect(pending).toHaveLength(1);
    expect(JSON.parse(kv.data.get(KEYS.runner) as string).pushHeldUntil).toBeUndefined();
  });

  it('stores but holds push when most districts jump to danger at once, and keeps holding on the next upload', async () => {
    const { env, kv } = makeEnv();
    const { ctx, pending } = fakeCtx();
    await post(env, ctx, JSON.stringify(rainFeed(0)));
    pending.length = 0;

    const res = await post(env, ctx, JSON.stringify(rainFeed(15)));
    expect(await res.json()).toMatchObject({ ok: true, held: true });
    expect(pending).toHaveLength(0);
    const stored = JSON.parse(kv.data.get(KEYS.runner) as string) as GroupSnapshot;
    expect(stored.feeds.rain?.items).toHaveLength(20);
    expect(Date.parse(stored.pushHeldUntil!)).toBeGreaterThan(Date.now() + (INGEST.pushHoldMinutes - 1) * 60_000);

    // Same data again is not a new jump, but the hold stays until it expires.
    expect(await (await post(env, ctx, JSON.stringify(rainFeed(15)))).json()).toMatchObject({ held: true });
    expect(pending).toHaveLength(0);
  });
});

describe('runner push hold in the store', () => {
  it('carries an active hold over and drops an expired one', async () => {
    const { kv } = fakeKv();
    const now = new Date('2026-10-13T10:00:00Z');
    const held = await writeGroup(kv, KEYS.runner, {}, now, { holdPushUntil: new Date('2026-10-13T10:40:00Z') });
    expect(isPushHeld(held, now)).toBe(true);
    const next = await writeGroup(kv, KEYS.runner, {}, new Date('2026-10-13T10:20:00Z'));
    expect(next.pushHeldUntil).toBe(held.pushHeldUntil);
    const later = await writeGroup(kv, KEYS.runner, {}, new Date('2026-10-13T10:41:00Z'));
    expect(later.pushHeldUntil).toBeUndefined();
    expect(isPushHeld(null, now)).toBe(false);
  });
});

describe('push routes', () => {
  const routes = ['/v1/push/subscribe', '/v1/push/unsubscribe', '/v1/push/test'] as const;
  const call = (env: Env, path: string, headers: Record<string, string>, body = '{}') =>
    app.request(`${BASE}${path}`, { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.9', ...headers }, body }, env, fakeCtx().ctx);

  it('returns 429 with retry-after once the per-IP limit is passed', async () => {
    const { db } = fakeDb(({ sql }) => (sql.includes('rate_limits') ? { hits: 999 } : null));
    const { env } = makeEnv({ PUSH_DB: db });
    for (const path of routes) {
      const res = await call(env, path, { 'content-type': 'application/json' });
      expect(res.status, path).toBe(429);
      expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    }
    expect(RATE_LIMITS.subscribe).toBeLessThan(999);
  });

  it('rejects non-JSON and oversized bodies', async () => {
    const { db } = fakeDb(({ sql }) => (sql.includes('rate_limits') ? { hits: 1 } : null));
    const { env } = makeEnv({ PUSH_DB: db });
    for (const path of routes) {
      expect((await call(env, path, { 'content-type': 'text/plain' })).status, path).toBe(415);
      expect((await call(env, path, { 'content-type': 'application/json', 'content-length': '100000' })).status, path).toBe(413);
      expect((await call(env, path, { 'content-type': 'application/json' }, '{"endpoint":')).status, path).toBe(400);
    }
  });
});

describe('/v1/weather', () => {
  it('serves Thailand only', async () => {
    const { env } = makeEnv();
    for (const q of ['lat=51.5&lng=-0.12', 'lat=0&lng=0', 'lat=13.75', 'lat=&lng=', 'lat=x&lng=100.5']) {
      const res = await app.request(`${BASE}/v1/weather?${q}`, {}, env, fakeCtx().ctx);
      expect(res.status, q).toBe(400);
    }
  });

  it('answers 503 once the daily cap is used, without calling Open-Meteo', async () => {
    const { db } = fakeDb(({ sql }) => (sql.startsWith('SELECT hits') ? { hits: INGEST.weatherDailyCap } : null));
    const { env } = makeEnv({ PUSH_DB: db });
    const res = await app.request(`${BASE}/v1/weather?lat=13.7563&lng=100.5018`, {}, env, fakeCtx().ctx);
    expect(res.status).toBe(503);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('counts calls per UTC day in a row the rate-limit prune keeps', async () => {
    const { db, queries } = fakeDb(() => ({ hits: 3 }));
    const now = new Date('2026-10-13T10:00:00Z');
    expect(await takeWeatherQuota(db, now, 5)).toMatchObject({ ok: true });
    const dayEnd = Date.parse('2026-10-14T00:00:00Z') / 1000;
    expect(queries.at(-1)!.args).toEqual(['weather:global', dayEnd]);
    expect(await takeWeatherQuota(db, now, 3)).toMatchObject({ ok: false, retryAfter: 14 * 3600 });
  });
});

describe('/v1/radar/:id', () => {
  const id = Object.keys(RADARS)[0]!;
  const bundle = (time: string) => {
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const header = new TextEncoder().encode(JSON.stringify({ radars: [{ id, time, echoPixels: 1, offset: 0, length: png.length }] }));
    const out = new Uint8Array(4 + header.length + png.length);
    new DataView(out.buffer).setUint32(0, header.length);
    out.set(header, 4);
    out.set(png, 4 + header.length);
    return out.buffer;
  };

  it('ignores cache-busting query strings', async () => {
    const { env, kv } = makeEnv();
    kv.data.set(KEYS.radarBundle, bundle('2026-10-13T10:00:00Z'));
    const { ctx, pending } = fakeCtx();
    for (const q of ['', '?t=2026-10-13T10:00:00Z', '?x=1', '?x=2&t=2026-10-13T09:00:00Z', '?t=garbage']) {
      const res = await app.request(`${BASE}/v1/radar/${id}${q}`, {}, env, ctx);
      expect(res.status, q).toBe(200);
      expect(res.headers.get('x-radar-time')).toBe('2026-10-13T10:00:00Z');
      await Promise.all(pending);
    }
    expect(kv.gets()).toBe(1);
  });

  it('re-reads the bundle for a newer frame at most once per recheck interval', async () => {
    const { env, kv } = makeEnv();
    kv.data.set(KEYS.radarBundle, bundle('2026-10-13T10:00:00Z'));
    const { ctx, pending } = fakeCtx();
    await app.request(`${BASE}/v1/radar/${id}`, {}, env, ctx);
    await Promise.all(pending);
    // Fresh copy: a newer t must not reach KV yet, and the stale image must not be browser-cached under the new URL.
    const early = await app.request(`${BASE}/v1/radar/${id}?t=2026-10-13T10:10:00Z`, {}, env, ctx);
    expect(early.headers.get('cache-control')).toBe('no-store');
    expect(kv.gets()).toBe(1);

    const key = `${BASE}/v1/radar/${id}`;
    const old = cacheStore.get(key)!;
    const aged = new Response(await old.clone().arrayBuffer(), old);
    aged.headers.set('x-radar-checked-at', String(Date.now() - (INGEST.radarRecheckSeconds + 1) * 1000));
    cacheStore.set(key, aged);
    kv.data.set(KEYS.radarBundle, bundle('2026-10-13T10:10:00Z'));
    const res = await app.request(`${BASE}/v1/radar/${id}?t=2026-10-13T10:10:00Z`, {}, env, ctx);
    expect(kv.gets()).toBe(2);
    expect(res.headers.get('x-radar-time')).toBe('2026-10-13T10:10:00Z');
    expect(res.headers.get('cache-control')).toBe(`public, max-age=${INGEST.cacheSeconds.radar}`);
  });
});

describe('/v1/area', () => {
  it('rounds coordinates before use and caches per district', async () => {
    const { env } = makeEnv();
    const { ctx, pending } = fakeCtx();
    const res = await app.request(`${BASE}/v1/area?lat=13.756331&lng=100.501765`, {}, env, ctx);
    expect(res.status).toBe(200);
    await Promise.all(pending);
    expect([...cacheStore.keys()]).toEqual([`${BASE}/v1/area?district=${districtAt({ lat: 13.76, lng: 100.5 })!.properties.id}`]);
  });
});

describe('CORS origins', () => {
  const list = 'https://hazard.pdouvch.com, http://localhost:3000,http://127.0.0.1:3000';
  it('drops localhost origins in production', () => {
    expect(allowedOrigins(list, 'https://api.hazard.pdouvch.com/v1/snapshot')).toEqual(['https://hazard.pdouvch.com']);
  });
  it('keeps them under wrangler dev', () => {
    expect(allowedOrigins(list, 'http://localhost:8787/v1/snapshot')).toEqual(['https://hazard.pdouvch.com', 'http://localhost:3000', 'http://127.0.0.1:3000']);
  });
  it('does not answer a localhost origin from production', async () => {
    const { env } = makeEnv();
    const res = await app.request(`${BASE}/v1/districts`, { headers: { origin: 'http://localhost:3000' } }, env, fakeCtx().ctx);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
