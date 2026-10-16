import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { districtAt } from '../src/area';
import { INGEST } from '../src/config';
import { app, type Env } from '../src/index';
import { KEYS, writeGroup, type GroupSnapshot } from '../src/store';

// Fakes copied from routes-security.test.ts, plus a put counter (every KV write costs part of the 1,000/day).
function fakeKv() {
  const data = new Map<string, string | ArrayBuffer>();
  let puts = 0;
  const kv = {
    async get(key: string, type?: string) {
      const v = data.get(key);
      if (v === undefined) return null;
      return type === 'json' ? JSON.parse(v as string) : v;
    },
    async put(key: string, value: string | ArrayBuffer) {
      puts++;
      data.set(key, value);
    },
  };
  return { kv: kv as unknown as KVNamespace, data, puts: () => puts };
}

function fakeDb() {
  const stmt = () => ({
    bind: () => stmt(),
    first: async () => null,
    run: async () => ({ success: true }),
    all: async () => ({ results: [] }),
  });
  const db = { prepare: () => stmt(), batch: async () => [] };
  return db as unknown as D1Database;
}

function fakeCtx() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: { waitUntil: (p: Promise<unknown>) => pending.push(p.catch(() => {})), passThroughOnException() {}, props: {} } as unknown as ExecutionContext,
    pending,
  };
}

const TOKEN = 'secret-token-123';

function makeEnv() {
  const kv = fakeKv();
  const env = {
    SNAPSHOTS: kv.kv,
    PUSH_DB: fakeDb(),
    INGEST_TOKEN: TOKEN,
    ALLOWED_ORIGINS: 'https://hazard.pdouvch.com,http://localhost:3000',
    VAPID_PUBLIC_KEY: 'x',
    VAPID_PRIVATE_KEY: 'x',
    VAPID_SUBJECT: 'https://hazard.pdouvch.com',
    SITE_URL: 'https://hazard.pdouvch.com',
    GITHUB_REPO: 'x/y',
  } as Env;
  return { env, kv };
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

const fixture = (name: string) => readFileSync(new URL(`../../../packages/sources/test/fixtures/${name}`, import.meta.url), 'utf8');
const FLOOD = fixture('bma-flood.json');
const RAIN = fixture('bma-rain.json');

const json = { 'content-type': 'application/json' };

const relay = (env: Env, ctx: ExecutionContext, kind: string, body: string, country: string | undefined = 'TH', headers: Record<string, string> = json) => {
  const req = new Request(`https://api.hazard.pdouvch.com/v1/relay/bma/${kind}`, { method: 'POST', headers, body });
  if (country) Object.defineProperty(req, 'cf', { value: { country } });
  return app.request(req, undefined, env, ctx);
};

const runner = (env: Env, ctx: ExecutionContext, payload: unknown) =>
  app.request('/ingest/runner', { method: 'POST', headers: { ...json, authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(payload) }, env, ctx);

const stored = (kv: ReturnType<typeof fakeKv>) => JSON.parse(kv.data.get(KEYS.runner) as string) as GroupSnapshot;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

const WATERLEVEL = {
  id: 'thaiwater:WL1',
  kind: 'waterlevel',
  source: 'thaiwater',
  name: { th: 'สถานี', en: 'Station' },
  location: { lat: 13.75, lng: 100.5 },
  observedAt: minutesAgo(30).toISOString(),
  value: 1,
  unit: 'm',
  severity: 'ok',
};

/** Stores a runner snapshot whose `kind` feed was last fetched `age` minutes ago, plus an untouched waterlevel feed. */
async function seed(kv: ReturnType<typeof fakeKv>, kind: 'flood' | 'rain', age: number) {
  const at = minutesAgo(age).toISOString();
  await writeGroup(
    kv.kv,
    KEYS.runner,
    {
      [kind]: { source: `bma-${kind}`, fetchedAt: at, ok: true, items: [] },
      waterlevel: { source: 'thaiwater', fetchedAt: at, ok: true, items: [WATERLEVEL] },
    },
    minutesAgo(age),
  );
}

describe('POST /v1/relay/bma/:kind', () => {
  it('404s an unknown feed', async () => {
    const { env, kv } = makeEnv();
    const { ctx } = fakeCtx();
    const res = await relay(env, ctx, 'waterlevel', FLOOD);
    expect(res.status).toBe(404);
    expect(kv.puts()).toBe(0);
  });

  it('403s outside Thailand or without cf data, writing nothing', async () => {
    const { env, kv } = makeEnv();
    const { ctx, pending } = fakeCtx();
    // '' sends no cf object at all (as in local dev); undefined would pick the 'TH' default.
    for (const country of ['US', '']) {
      const res = await relay(env, ctx, 'flood', FLOOD, country);
      expect(res.status, String(country)).toBe(403);
      expect(await res.json()).toEqual({ error: 'outside Thailand' });
    }
    expect(kv.puts()).toBe(0);
    expect(pending).toHaveLength(0);
  });

  it('skips a fresh copy without reading the body', async () => {
    const { env, kv } = makeEnv();
    const { ctx, pending } = fakeCtx();
    await seed(kv, 'flood', 9);
    const puts = kv.puts();
    // Wrong content type and junk body: never looked at while the stored copy is fresh.
    const res = await relay(env, ctx, 'flood', 'not json', 'TH', { 'content-type': 'text/plain' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, written: false });
    expect(kv.puts()).toBe(puts);
    expect(pending).toHaveLength(0);
  });

  it('rejects bad bodies without writing', async () => {
    const { env, kv } = makeEnv();
    const { ctx } = fakeCtx();
    expect((await relay(env, ctx, 'flood', FLOOD, 'TH', { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await relay(env, ctx, 'flood', '[]', 'TH', { ...json, 'content-length': String(INGEST.maxUploadBytes + 1) })).status).toBe(413);
    expect((await relay(env, ctx, 'flood', 'not json')).status).toBe(400);
    for (const body of ['{}', '[]', '[{"flood_id":1}]']) {
      const res = await relay(env, ctx, 'flood', body);
      expect(res.status, body).toBe(400);
      expect(await res.json()).toHaveProperty('error');
    }
    expect(kv.puts()).toBe(0);
  });

  it('writes a stale feed into the runner group, keeps other feeds, pushes, then skips until 10 min pass', async () => {
    const { env, kv } = makeEnv();
    const { ctx, pending } = fakeCtx();
    await seed(kv, 'flood', 11);
    const before = kv.puts();

    const res = await relay(env, ctx, 'flood', FLOOD);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: number };
    expect(body).toMatchObject({ ok: true, written: true, held: false });
    expect(body.items).toBeGreaterThan(0);
    expect(kv.puts()).toBe(before + 1);
    expect(pending).toHaveLength(1);

    const snap = stored(kv);
    expect(snap.feeds.flood).toMatchObject({ source: 'bma-flood', ok: true });
    expect(snap.feeds.flood!.items).toHaveLength(body.items);
    expect(snap.feeds.flood!.lastOkAt).toBe(snap.feeds.flood!.fetchedAt);
    expect(snap.feeds.waterlevel!.items).toEqual([WATERLEVEL]);

    // A second phone right after: nothing written.
    expect(await (await relay(env, ctx, 'flood', FLOOD)).json()).toEqual({ ok: true, written: false });
    expect(kv.puts()).toBe(before + 1);

    // Rain is a separate feed, so it is still stale and gets written.
    expect(await (await relay(env, ctx, 'rain', RAIN)).json()).toMatchObject({ ok: true, written: true });
    expect(stored(kv).feeds.flood!.items).toHaveLength(body.items);

    // Once the flood copy is 10 min old it is written again.
    const aged = stored(kv);
    aged.feeds.flood = { ...aged.feeds.flood!, fetchedAt: minutesAgo(10).toISOString(), lastOkAt: minutesAgo(10).toISOString() };
    kv.data.set(KEYS.runner, JSON.stringify(aged));
    expect(await (await relay(env, ctx, 'flood', FLOOD)).json()).toMatchObject({ written: true });
  });

  // One point inside each of 20 real districts (same idea as routes-security.test.ts).
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

  /** Raw BMA rain gauges, one per district; the first `dangerCount` report 120 mm/h. */
  const rawRain = (dangerCount: number) =>
    points.map((p, i) => ({
      rain_id: i,
      rain_code: `RF.T.${i}`,
      rain_name: `จุด ${i}`,
      rain_name_en: `Point ${i}`,
      latitude: p.lat,
      longitude: p.lng,
      site_timestamp: `/Date(${minutesAgo(5).getTime()})/`,
      rf1hr: i < dangerCount ? 120 : 1,
      rf24hr: i < dangerCount ? 120 : 1,
      status: 1,
      district_name: null,
    }));

  it('holds push when a relay turns most districts to danger at once', async () => {
    expect(points.length).toBe(20);
    const { env, kv } = makeEnv();
    const { ctx, pending } = fakeCtx();
    // Baseline: a calm rain copy 11 min old (stale for relaying, still a fresh baseline for the jump check).
    const baseline = rawRain(0).map((g, i) => ({
      id: `bma-rain:${g.rain_code}`,
      kind: 'rain',
      source: 'bma-rain',
      name: { th: g.rain_name, en: g.rain_name_en },
      location: points[i],
      observedAt: minutesAgo(12).toISOString(),
      value: 1,
      unit: 'mm/h',
      severity: 'ok',
    }));
    await writeGroup(kv.kv, KEYS.runner, { rain: { source: 'bma-rain', fetchedAt: minutesAgo(11).toISOString(), ok: true, items: baseline } }, minutesAgo(11));

    const res = await relay(env, ctx, 'rain', JSON.stringify(rawRain(15)));
    expect(await res.json()).toMatchObject({ ok: true, written: true, items: 20, held: true });
    expect(pending).toHaveLength(0);
    expect(Date.parse(stored(kv).pushHeldUntil!)).toBeGreaterThan(Date.now() + (INGEST.pushHoldMinutes - 1) * 60_000);
  });
});

describe('/ingest/runner with a relayed copy', () => {
  const failedFlood = () => ({ feeds: { flood: { source: 'bma-flood', fetchedAt: new Date().toISOString(), ok: false, items: [], error: 'HTTP 403' } } });

  it('keeps a recent relayed flood copy instead of marking it failing, without a KV write', async () => {
    const { env, kv } = makeEnv();
    const { ctx } = fakeCtx();
    await seed(kv, 'flood', 20);
    const before = kv.puts();
    const res = await runner(env, ctx, failedFlood());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, feeds: [], dropped: 0, held: false });
    expect(kv.puts()).toBe(before);
    const flood = stored(kv).feeds.flood!;
    expect(flood.ok).toBe(true);
    expect(flood.failingSince).toBeUndefined();
  });

  it('still writes the other feeds of the upload', async () => {
    const { env, kv } = makeEnv();
    const { ctx } = fakeCtx();
    await seed(kv, 'flood', 20);
    const payload = failedFlood();
    const at = new Date().toISOString();
    (payload.feeds as Record<string, unknown>).cctv = { source: 'bma-traffic', fetchedAt: at, ok: true, items: [] };
    const before = kv.puts();
    const res = await runner(env, ctx, payload);
    expect(await res.json()).toMatchObject({ ok: true, feeds: expect.arrayContaining(['flood', 'waterlevel', 'cctv']) });
    expect(kv.puts()).toBe(before + 1);
    const snap = stored(kv);
    expect(snap.feeds.cctv).toMatchObject({ ok: true, fetchedAt: at });
    expect(snap.feeds.flood!.ok).toBe(true);
    expect(snap.feeds.waterlevel!.items).toEqual([WATERLEVEL]);
  });

  it('marks the feed failing once the relayed copy is older than the keep window', async () => {
    const { env, kv } = makeEnv();
    const { ctx } = fakeCtx();
    await seed(kv, 'flood', INGEST.relayKeepMinutes + 1);
    const res = await runner(env, ctx, failedFlood());
    expect(res.status).toBe(200);
    const flood = stored(kv).feeds.flood!;
    expect(flood.ok).toBe(false);
    expect(flood.failingSince).toBeDefined();
  });
});
