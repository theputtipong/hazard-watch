import { RADARS, type DashboardSnapshot } from '@hw/core';
import { t } from '@hw/core/i18n';
import { defaultContext, fetchWeather, FEEDS, REQUEST, type EdgeFeed, type RunnerFeed } from '@hw/sources';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { INGEST } from './config';
import { isPushEndpoint } from './push/notifier';
import { cleanPrefs, type IncomingPrefs } from './push/prefs';
import { DISTRICT_IDS, messageFor, notifierFor, sendAlerts, type PushEnv } from './push/run';
import { deleteSubscription, getSubscription, markSent, sentSince, subscriptionId, upsertSubscription } from './push/store';
import { KEYS, readGroup, unpackRadar, writeGroup, type FeedMap } from './store';
import { buildSummary } from './summary';

export interface Env extends PushEnv {
  SNAPSHOTS: KVNamespace;
  GITHUB_REPO: string;
  /** Optional secret: fine-grained token with Actions read/write on GITHUB_REPO only. */
  GITHUB_DISPATCH_TOKEN?: string;
  INGEST_TOKEN: string;
  ALLOWED_ORIGINS: string;
  WEATHER_LIMITER?: RateLimit;
}

const RUNNER_FEEDS = Object.keys(FEEDS.runner) as RunnerFeed[];

export async function runEdgeFeeds(env: Env, now = new Date()) {
  const ctx = defaultContext({ now });
  const entries = await Promise.all(
    (Object.entries(FEEDS.edge) as [EdgeFeed, (typeof FEEDS.edge)[EdgeFeed]][]).map(async ([name, run]) => [name, await run(ctx)] as const),
  );
  return writeGroup(env.SNAPSHOTS, KEYS.edge, Object.fromEntries(entries) as FeedMap, now);
}

async function dispatchRunner(env: Env, now = new Date()) {
  if (!env.GITHUB_DISPATCH_TOKEN) return;
  if (Math.floor(now.getTime() / 60_000) % INGEST.runnerDispatchEveryMinutes >= 10) return; // cron fires every 10 min
  const workflow = `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${INGEST.runnerWorkflow}`;
  const headers = {
    authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'hw-ingest',
  };
  const latest = await fetch(`${workflow}/runs?per_page=1`, { headers });
  if (latest.ok) {
    const created = ((await latest.json()) as { workflow_runs?: { created_at: string }[] }).workflow_runs?.[0]?.created_at;
    if (created && now.getTime() - new Date(created).getTime() < INGEST.runnerDispatchDedupeMinutes * 60_000) {
      console.log('dispatch runner skipped: run started', created);
      return;
    }
  }
  const res = await fetch(`${workflow}/dispatches`, { method: 'POST', headers, body: JSON.stringify({ ref: 'main' }) });
  console.log('dispatch runner', res.status);
}

async function pushAfterUpdate(env: Env) {
  const [edge, runner] = await Promise.all([readGroup(env.SNAPSHOTS, KEYS.edge), readGroup(env.SNAPSHOTS, KEYS.runner)]);
  const stats = await sendAlerts(env, { edge, runner } as DashboardSnapshot);
  console.log('push', JSON.stringify(stats));
  return stats;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/v1/*', async (c, next) =>
  cors({ origin: c.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()), allowMethods: ['GET', 'POST'], allowHeaders: ['content-type'] })(c, next),
);

app.get('/', (c) => c.text('hw-ingest ok'));

/** Serves from the edge cache; `build` runs only on a miss. Cached copies are stored before CORS headers are added. */
async function edgeCached(c: Context<{ Bindings: Env }>, key: string, seconds: number, build: () => Promise<Response>) {
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return withMaxAge(new Response(hit.body, hit), seconds);
  const res = await build();
  if (res.ok) {
    res.headers.set('cache-control', `public, max-age=${seconds}`);
    c.executionCtx.waitUntil(cache.put(key, res.clone()));
  }
  return res;
}

// The zone's Browser Cache TTL (4 h) rewrites cache-control on stored copies; reset it so browsers refetch on time.
function withMaxAge(res: Response, seconds: number) {
  res.headers.set('cache-control', `public, max-age=${seconds}`);
  return res;
}

const cacheKey = (c: Context, path: string) => `${new URL(c.req.url).origin}${path}`;

app.get('/v1/snapshot', (c) =>
  edgeCached(c, cacheKey(c, '/v1/snapshot'), INGEST.cacheSeconds.snapshot, async () => {
    const [edge, runner] = await Promise.all([readGroup(c.env.SNAPSHOTS, KEYS.edge), readGroup(c.env.SNAPSHOTS, KEYS.runner)]);
    return Response.json({ edge, runner });
  }),
);

app.get('/v1/summary', async (c) => {
  return edgeCached(c, cacheKey(c, '/v1/summary'), INGEST.cacheSeconds.snapshot, async () => {
    const [edge, runner] = await Promise.all([readGroup(c.env.SNAPSHOTS, KEYS.edge), readGroup(c.env.SNAPSHOTS, KEYS.runner)]);
    return Response.json(buildSummary(edge, runner));
  });
});

app.get('/v1/weather', async (c) => {
  const lat = Number(c.req.query('lat'));
  const lng = Number(c.req.query('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return c.json({ error: 'lat and lng are required' }, 400);
  }
  // One cache entry per ~1 km cell, and a per-IP limit on misses, so the Open-Meteo daily quota can't be drained.
  const d = REQUEST.weatherCoordDecimals;
  const cell = { lat: Number(lat.toFixed(d)), lng: Number(lng.toFixed(d)) };
  return edgeCached(c, cacheKey(c, `/v1/weather?lat=${cell.lat}&lng=${cell.lng}`), INGEST.cacheSeconds.weather, async () => {
    const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
    if (c.env.WEATHER_LIMITER && !(await c.env.WEATHER_LIMITER.limit({ key: ip })).success) {
      return Response.json({ error: 'too many requests' }, { status: 429 });
    }
    return Response.json(await fetchWeather(defaultContext(), cell));
  });
});

app.get('/v1/radar/:id', async (c) => {
  const id = c.req.param('id');
  if (!(id in RADARS)) return c.json({ error: 'unknown radar' }, 404);
  // Edge-cached per URL (?t=<frame time>) so the bundle is read from KV once per frame.
  const cache = caches.default;
  const hit = await cache.match(c.req.raw);
  if (hit) return withMaxAge(new Response(hit.body, hit), INGEST.cacheSeconds.radar);
  const bundle = await c.env.SNAPSHOTS.get(KEYS.radarBundle, 'arrayBuffer');
  const found = bundle ? unpackRadar(bundle, id) : null;
  if (!found) return c.json({ error: 'no image yet' }, 404);
  const res = new Response(found.png, {
    headers: {
      'content-type': 'image/png',
      'cache-control': `public, max-age=${INGEST.cacheSeconds.radar}`,
      'x-radar-time': found.entry.time,
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'x-radar-time',
    },
  });
  c.executionCtx.waitUntil(cache.put(c.req.raw, res.clone()));
  return res;
});

app.get('/v1/push/key', (c) => c.json({ publicKey: c.env.VAPID_PUBLIC_KEY }));

app.post('/v1/push/subscribe', async (c) => {
  const body = await c.req
    .json<{
      subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      lang?: string;
      district?: string;
      subdistrict?: string | null;
      prefs?: IncomingPrefs;
    }>()
    .catch(() => null);
  const endpoint = body?.subscription?.endpoint ?? '';
  const { p256dh = '', auth = '' } = body?.subscription?.keys ?? {};
  if (!isPushEndpoint(endpoint) || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    return c.json({ error: 'invalid subscription' }, 400);
  }
  if (!body?.district || !DISTRICT_IDS.has(body.district)) return c.json({ error: 'unknown district' }, 400);
  const { prefs, quakeMinMag, quakeMaxKm } = cleanPrefs(body.prefs);
  const id = await upsertSubscription(
    c.env.PUSH_DB,
    {
      endpoint,
      p256dh,
      auth,
      lang: body.lang === 'en' ? 'en' : 'th',
      district: body.district,
      subdistrict: body.subdistrict?.startsWith(body.district) ? body.subdistrict : null,
      prefs,
      quake_min_mag: quakeMinMag,
      quake_max_km: quakeMaxKm,
    },
    new Date(),
  );
  return c.json({ ok: true, id });
});

app.post('/v1/push/unsubscribe', async (c) => {
  const body = await c.req.json<{ endpoint?: string }>().catch(() => null);
  if (!body?.endpoint) return c.json({ error: 'endpoint required' }, 400);
  await deleteSubscription(c.env.PUSH_DB, await subscriptionId(body.endpoint));
  return c.json({ ok: true });
});

app.post('/v1/push/test', async (c) => {
  const body = await c.req.json<{ endpoint?: string }>().catch(() => null);
  if (!body?.endpoint) return c.json({ error: 'endpoint required' }, 400);
  const sub = await getSubscription(c.env.PUSH_DB, await subscriptionId(body.endpoint));
  if (!sub) return c.json({ error: 'not subscribed' }, 404);
  const now = new Date();
  if ((await sentSince(c.env.PUSH_DB, sub.id, new Date(now.getTime() - 60_000))).has('test')) {
    return c.json({ error: 'try again in a minute' }, 429);
  }
  const alert = {
    key: 'test',
    title: { th: t('alert.test.title', 'th'), en: t('alert.test.title', 'en') },
    body: { th: t('alert.test.body', 'th'), en: t('alert.test.body', 'en') },
  };
  const result = await notifierFor(c.env).send(sub, messageFor(alert, sub, c.env.SITE_URL), 300);
  if (result === 'gone') await deleteSubscription(c.env.PUSH_DB, sub.id);
  else if (result === 'sent') await markSent(c.env.PUSH_DB, sub.id, 'test', now).run();
  return c.json({ result });
});

app.use('/ingest/*', async (c, next) => {
  const auth = c.req.header('authorization') ?? '';
  if (!c.env.INGEST_TOKEN || auth !== `Bearer ${c.env.INGEST_TOKEN}`) return c.json({ error: 'unauthorized' }, 401);
  const size = Number(c.req.header('content-length') ?? 0);
  if (size > INGEST.maxUploadBytes) return c.json({ error: 'payload too large' }, 413);
  await next();
});

app.post('/ingest/run-edge', async (c) => {
  const snapshot = await runEdgeFeeds(c.env);
  return c.json(Object.fromEntries(Object.entries(snapshot.feeds).map(([name, r]) => [name, { ok: r!.ok, items: r!.items.length, error: r!.error }])));
});

app.post('/ingest/runner', async (c) => {
  const body = await c.req.json<{ feeds: FeedMap }>();
  const feeds: FeedMap = {};
  for (const name of RUNNER_FEEDS) {
    const result = body.feeds?.[name];
    if (result && Array.isArray(result.items)) feeds[name] = result;
  }
  if (!Object.keys(feeds).length) return c.json({ error: 'no known feeds in payload' }, 400);
  const snapshot = await writeGroup(c.env.SNAPSHOTS, KEYS.runner, feeds, new Date());
  c.executionCtx.waitUntil(pushAfterUpdate(c.env));
  return c.json({ ok: true, feeds: Object.keys(snapshot.feeds) });
});

app.put('/ingest/radar-bundle', async (c) => {
  const body = await c.req.arrayBuffer();
  const headerLength = body.byteLength >= 4 ? new DataView(body).getUint32(0) : 0;
  let valid = headerLength > 0 && 4 + headerLength <= body.byteLength;
  if (valid) {
    try {
      valid = Array.isArray(JSON.parse(new TextDecoder().decode(new Uint8Array(body, 4, headerLength))).radars);
    } catch {
      valid = false;
    }
  }
  if (!valid) return c.json({ error: 'bad radar bundle' }, 400);
  await c.env.SNAPSHOTS.put(KEYS.radarBundle, body);
  return c.json({ ok: true });
});

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(dispatchRunner(env));
    ctx.waitUntil(runEdgeFeeds(env).then(() => pushAfterUpdate(env)));
  },
} satisfies ExportedHandler<Env>;

export { app };
