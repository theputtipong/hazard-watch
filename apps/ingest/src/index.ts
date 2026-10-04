import { activeRegions, regionRadars } from '@hw/core';
import { defaultContext, fetchWeather, FEEDS, type EdgeFeed, type RunnerFeed } from '@hw/sources';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { KEYS, readGroup, writeGroup, type FeedMap } from './store';

export interface Env {
  SNAPSHOTS: KVNamespace;
  INGEST_TOKEN: string;
  ALLOWED_ORIGINS: string;
}

const RUNNER_FEEDS = Object.keys(FEEDS.runner) as RunnerFeed[];
const RADAR_IDS = new Set(regionRadars(activeRegions()));
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function runEdgeFeeds(env: Env, now = new Date()) {
  const ctx = defaultContext({ now });
  const entries = await Promise.all(
    (Object.entries(FEEDS.edge) as [EdgeFeed, (typeof FEEDS.edge)[EdgeFeed]][]).map(async ([name, run]) => [name, await run(ctx)] as const),
  );
  return writeGroup(env.SNAPSHOTS, KEYS.edge, Object.fromEntries(entries) as FeedMap, now);
}

const app = new Hono<{ Bindings: Env }>();

app.use('/v1/*', async (c, next) =>
  cors({ origin: c.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()), allowMethods: ['GET'] })(c, next),
);

app.get('/', (c) => c.text('hw-ingest ok'));

/** Everything the dashboard needs in one request. */
app.get('/v1/snapshot', async (c) => {
  const [edge, runner] = await Promise.all([readGroup(c.env.SNAPSHOTS, KEYS.edge), readGroup(c.env.SNAPSHOTS, KEYS.runner)]);
  c.header('cache-control', 'public, max-age=60');
  return c.json({ edge, runner });
});

app.get('/v1/weather', async (c) => {
  const lat = Number(c.req.query('lat'));
  const lng = Number(c.req.query('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return c.json({ error: 'lat and lng are required' }, 400);
  }
  const weather = await fetchWeather(defaultContext(), { lat, lng });
  c.header('cache-control', 'public, max-age=600');
  return c.json(weather);
});

app.get('/v1/radar/:id', async (c) => {
  const id = c.req.param('id');
  if (!RADAR_IDS.has(id)) return c.json({ error: 'unknown radar' }, 404);
  const { value, metadata } = await c.env.SNAPSHOTS.getWithMetadata<{ time: string; contentType: string }>(KEYS.radar(id), 'arrayBuffer');
  if (!value || !metadata) return c.json({ error: 'no image yet' }, 404);
  return c.body(value, 200, {
    'content-type': metadata.contentType,
    'cache-control': 'public, max-age=120',
    'x-radar-time': metadata.time,
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'x-radar-time',
  });
});

// ---- Writes from the GitHub Actions runner (feeds blocked from Cloudflare IPs) ----

app.use('/ingest/*', async (c, next) => {
  const auth = c.req.header('authorization') ?? '';
  if (!c.env.INGEST_TOKEN || auth !== `Bearer ${c.env.INGEST_TOKEN}`) return c.json({ error: 'unauthorized' }, 401);
  const size = Number(c.req.header('content-length') ?? 0);
  if (size > MAX_UPLOAD_BYTES) return c.json({ error: 'payload too large' }, 413);
  await next();
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
    ctx.waitUntil(runEdgeFeeds(env));
  },
} satisfies ExportedHandler<Env>;

export { app };
