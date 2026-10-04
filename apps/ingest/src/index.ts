import { activeRegions, DEFAULT_CONFIG, regionRadars, type DashboardSnapshot, type PushKind } from '@hw/core';
import { t } from '@hw/core/i18n';
import { defaultContext, fetchWeather, FEEDS, type EdgeFeed, type RunnerFeed } from '@hw/sources';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { INGEST } from './config';
import { isPushEndpoint } from './push/notifier';
import { DISTRICT_IDS, messageFor, notifierFor, sendAlerts, type PushEnv } from './push/run';
import { deleteSubscription, getSubscription, recentlySent, markSent, subscriptionId, upsertSubscription } from './push/store';
import { KEYS, readGroup, writeGroup, type FeedMap } from './store';

export interface Env extends PushEnv {
  SNAPSHOTS: KVNamespace;
  INGEST_TOKEN: string;
  ALLOWED_ORIGINS: string;
}

const RUNNER_FEEDS = Object.keys(FEEDS.runner) as RunnerFeed[];
const RADAR_IDS = new Set(regionRadars(activeRegions()));

export async function runEdgeFeeds(env: Env, now = new Date()) {
  const ctx = defaultContext({ now });
  const entries = await Promise.all(
    (Object.entries(FEEDS.edge) as [EdgeFeed, (typeof FEEDS.edge)[EdgeFeed]][]).map(async ([name, run]) => [name, await run(ctx)] as const),
  );
  return writeGroup(env.SNAPSHOTS, KEYS.edge, Object.fromEntries(entries) as FeedMap, now);
}

/** Reads both snapshot groups and pushes whatever is new to subscribers. */
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

/** Everything the dashboard needs in one request. */
app.get('/v1/snapshot', async (c) => {
  const [edge, runner] = await Promise.all([readGroup(c.env.SNAPSHOTS, KEYS.edge), readGroup(c.env.SNAPSHOTS, KEYS.runner)]);
  c.header('cache-control', `public, max-age=${INGEST.cacheSeconds.snapshot}`);
  return c.json({ edge, runner });
});

app.get('/v1/weather', async (c) => {
  const lat = Number(c.req.query('lat'));
  const lng = Number(c.req.query('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return c.json({ error: 'lat and lng are required' }, 400);
  }
  const weather = await fetchWeather(defaultContext(), { lat, lng });
  c.header('cache-control', `public, max-age=${INGEST.cacheSeconds.weather}`);
  return c.json(weather);
});

app.get('/v1/radar/:id', async (c) => {
  const id = c.req.param('id');
  if (!RADAR_IDS.has(id)) return c.json({ error: 'unknown radar' }, 404);
  const { value, metadata } = await c.env.SNAPSHOTS.getWithMetadata<{ time: string; contentType: string }>(KEYS.radar(id), 'arrayBuffer');
  if (!value || !metadata) return c.json({ error: 'no image yet' }, 404);
  return c.body(value, 200, {
    'content-type': metadata.contentType,
    'cache-control': `public, max-age=${INGEST.cacheSeconds.radar}`,
    'x-radar-time': metadata.time,
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'x-radar-time',
  });
});

// ---- Web Push subscriptions (only the area is stored, never coordinates) ----

const PUSH_KINDS = new Set<PushKind>(DEFAULT_CONFIG.push.kinds);

app.get('/v1/push/key', (c) => c.json({ publicKey: c.env.VAPID_PUBLIC_KEY }));

app.post('/v1/push/subscribe', async (c) => {
  const body = await c.req
    .json<{
      subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      lang?: string;
      district?: string;
      subdistrict?: string | null;
      prefs?: { kinds?: string[]; pm25At?: number };
    }>()
    .catch(() => null);
  const endpoint = body?.subscription?.endpoint ?? '';
  const { p256dh = '', auth = '' } = body?.subscription?.keys ?? {};
  if (!isPushEndpoint(endpoint) || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    return c.json({ error: 'invalid subscription' }, 400);
  }
  if (!body?.district || !DISTRICT_IDS.has(body.district)) return c.json({ error: 'unknown district' }, 400);
  const kinds = (body.prefs?.kinds ?? []).filter((k): k is PushKind => PUSH_KINDS.has(k as PushKind));
  const pm25At = Number(body.prefs?.pm25At);
  const id = await upsertSubscription(
    c.env.PUSH_DB,
    {
      endpoint,
      p256dh,
      auth,
      lang: body.lang === 'en' ? 'en' : 'th',
      district: body.district,
      subdistrict: body.subdistrict?.startsWith(body.district) ? body.subdistrict : null,
      prefs: { kinds, ...(Number.isFinite(pm25At) && pm25At > 0 && pm25At < 1000 ? { pm25At } : {}) },
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

/** Sends one test notification to an existing subscription (at most once a minute). */
app.post('/v1/push/test', async (c) => {
  const body = await c.req.json<{ endpoint?: string }>().catch(() => null);
  if (!body?.endpoint) return c.json({ error: 'endpoint required' }, 400);
  const sub = await getSubscription(c.env.PUSH_DB, await subscriptionId(body.endpoint));
  if (!sub) return c.json({ error: 'not subscribed' }, 404);
  const now = new Date();
  if ((await recentlySent(c.env.PUSH_DB, sub.id, new Date(now.getTime() - 60_000))).has('test')) {
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

// ---- Writes from the GitHub Actions runner (feeds blocked from Cloudflare IPs) ----

app.use('/ingest/*', async (c, next) => {
  const auth = c.req.header('authorization') ?? '';
  if (!c.env.INGEST_TOKEN || auth !== `Bearer ${c.env.INGEST_TOKEN}`) return c.json({ error: 'unauthorized' }, 401);
  const size = Number(c.req.header('content-length') ?? 0);
  if (size > INGEST.maxUploadBytes) return c.json({ error: 'payload too large' }, 413);
  await next();
});

/** Runs the edge feeds now instead of waiting for the cron (for checks after a deploy). */
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

app.put('/ingest/radar/:id', async (c) => {
  const id = c.req.param('id');
  const time = c.req.query('time');
  const contentType = c.req.header('content-type') ?? '';
  if (!RADAR_IDS.has(id) || !time || !contentType.startsWith('image/')) return c.json({ error: 'bad radar upload' }, 400);
  await c.env.SNAPSHOTS.put(KEYS.radar(id), await c.req.arrayBuffer(), { metadata: { time, contentType } });
  return c.json({ ok: true });
});

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runEdgeFeeds(env).then(() => pushAfterUpdate(env)));
  },
} satisfies ExportedHandler<Env>;

export { app };
