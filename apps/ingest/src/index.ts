import { RADARS, type DashboardSnapshot } from '@hw/core';
import { t } from '@hw/core/i18n';
import { defaultContext, fetchWeather, FEEDS, REQUEST, type EdgeFeed } from '@hw/sources';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { INGEST, THAILAND_BOUNDS } from './config';
import { parseEndpointBody, parseSubscribeBody, rateLimit, readJsonBody, type PushAction } from './push/guard';
import { DISTRICTS, messageFor, notifierFor, sendAlerts, type PushEnv } from './push/run';
import { deleteSubscription, getSubscription, markSent, recordDelivery, sentSince, subscriptionId, upsertSubscription } from './push/store';
import { isPushHeld, KEYS, readGroup, unpackRadar, writeGroup, type FeedMap } from './store';
import { parseRunnerPayload, suspiciousJump } from './validate';
import { buildAreaReport, districtAt, districtList, findDistrict } from './area';
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

async function pushAfterUpdate(env: Env, now = new Date()) {
  const [edge, runner] = await Promise.all([readGroup(env.SNAPSHOTS, KEYS.edge), readGroup(env.SNAPSHOTS, KEYS.runner)]);
  // While a suspicious runner upload is held, edge alerts (PM2.5, quakes) still go out; held ones are sent once the hold ends.
  const held = isPushHeld(runner, now);
  const stats = await sendAlerts(env, { edge, runner: held ? null : runner } as DashboardSnapshot, now);
  console.log('push', JSON.stringify({ ...stats, runnerHeld: held }));
  return stats;
}

/** Hashes both sides so the comparison takes the same time whatever the length or first differing byte. */
export async function tokenMatches(header: string, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const digest = (s: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const [a, b] = await Promise.all([digest(header), digest(`Bearer ${token}`)]);
  // Workers provide timingSafeEqual; Node (tests) does not.
  if (typeof crypto.subtle.timingSafeEqual === 'function') return crypto.subtle.timingSafeEqual(a, b);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

const isLocalHost = (host: string) => host === 'localhost' || host === '127.0.0.1';

/** localhost origins in ALLOWED_ORIGINS only apply when the worker itself runs locally (wrangler dev). */
export function allowedOrigins(list: string, requestUrl: string): string[] {
  const local = isLocalHost(new URL(requestUrl).hostname);
  return list
    .split(',')
    .map((o) => o.trim())
    .filter((o) => {
      if (!o) return false;
      try {
        return local || !isLocalHost(new URL(o).hostname);
      } catch {
        return false;
      }
    });
}

/** Rounds to the ~1 km grid the web, extension and app already send, so finer coordinates are never used or cached. */
function toCell(lat: number, lng: number) {
  const d = REQUEST.weatherCoordDecimals;
  return { lat: Number(lat.toFixed(d)), lng: Number(lng.toFixed(d)) };
}

const inThailand = ({ lat, lng }: { lat: number; lng: number }) =>
  lat >= THAILAND_BOUNDS.minLat && lat <= THAILAND_BOUNDS.maxLat && lng >= THAILAND_BOUNDS.minLng && lng <= THAILAND_BOUNDS.maxLng;

/**
 * Global daily count of Open-Meteo calls, kept in the push guard's rate_limits table (D1 writes are cheap; a KV
 * counter would spend the 1,000 writes/day the snapshots need). window_start holds the day's end, so the push
 * cron's prune of windows older than 10 minutes leaves the row alone until the day is over.
 * Fails open: a D1 outage should not take weather down.
 */
export async function takeWeatherQuota(db: D1Database, now = new Date(), cap: number = INGEST.weatherDailyCap): Promise<{ ok: boolean; retryAfter: number }> {
  const nowSec = Math.floor(now.getTime() / 1000);
  const dayEnd = nowSec - (nowSec % 86_400) + 86_400;
  const retryAfter = dayEnd - nowSec;
  try {
    const row = await db.prepare('SELECT hits FROM rate_limits WHERE key = ?1 AND window_start = ?2').bind('weather:global', dayEnd).first<{ hits: number }>();
    if ((row?.hits ?? 0) >= cap) return { ok: false, retryAfter };
    await db
      .prepare(
        `INSERT INTO rate_limits (key, window_start, hits) VALUES (?1, ?2, 1)
         ON CONFLICT(key) DO UPDATE SET hits = CASE WHEN window_start = ?2 THEN hits + 1 ELSE 1 END, window_start = ?2`,
      )
      .bind('weather:global', dayEnd)
      .run();
    return { ok: true, retryAfter };
  } catch {
    return { ok: true, retryAfter: 0 };
  }
}

const app = new Hono<{ Bindings: Env }>();

app.use('/v1/*', async (c, next) =>
  cors({ origin: allowedOrigins(c.env.ALLOWED_ORIGINS, c.req.url), allowMethods: ['GET', 'POST'], allowHeaders: ['content-type'] })(c, next),
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

app.get('/v1/districts', (c) =>
  edgeCached(c, cacheKey(c, '/v1/districts'), INGEST.cacheSeconds.districts, async () => Response.json(districtList())),
);

/** One district, judged for the mobile app: `?district=<id>`, or `?lat=&lng=` for the district at a point. */
app.get('/v1/area', async (c) => {
  const id = c.req.query('district');
  const lat = Number(c.req.query('lat'));
  const lng = Number(c.req.query('lng'));
  let district;
  if (id) district = findDistrict(id);
  else if (Number.isFinite(lat) && Number.isFinite(lng) && c.req.query('lat') && c.req.query('lng')) district = districtAt(toCell(lat, lng));
  else return c.json({ error: 'district, or lat and lng, is required' }, 400);
  if (!district) return c.json({ error: id ? 'unknown district' : 'outside coverage' }, 404);
  // Cached per district, so every point inside it shares one entry.
  return edgeCached(c, cacheKey(c, `/v1/area?district=${district.properties.id}`), INGEST.cacheSeconds.snapshot, async () => {
    const [edge, runner] = await Promise.all([readGroup(c.env.SNAPSHOTS, KEYS.edge), readGroup(c.env.SNAPSHOTS, KEYS.runner)]);
    return Response.json(buildAreaReport({ edge, runner } as DashboardSnapshot, district));
  });
});

app.get('/v1/weather', async (c) => {
  const lat = Number(c.req.query('lat'));
  const lng = Number(c.req.query('lng'));
  if (!c.req.query('lat') || !c.req.query('lng') || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ error: 'lat and lng are required' }, 400);
  }
  // One cache entry per ~1 km cell inside Thailand, a per-IP limit and a global daily cap on misses, so the
  // Open-Meteo daily quota can't be drained.
  const cell = toCell(lat, lng);
  if (!inThailand(cell)) return c.json({ error: 'outside coverage' }, 400);
  return edgeCached(c, cacheKey(c, `/v1/weather?lat=${cell.lat}&lng=${cell.lng}`), INGEST.cacheSeconds.weather, async () => {
    const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
    if (c.env.WEATHER_LIMITER && !(await c.env.WEATHER_LIMITER.limit({ key: ip })).success) {
      return Response.json({ error: 'too many requests' }, { status: 429 });
    }
    const quota = await takeWeatherQuota(c.env.PUSH_DB);
    if (!quota.ok) return Response.json({ error: 'weather unavailable until tomorrow' }, { status: 503, headers: { 'retry-after': String(quota.retryAfter) } });
    return Response.json(await fetchWeather(defaultContext(), cell));
  });
});

const RADAR_CHECKED = 'x-radar-checked-at';

/**
 * The bundle keeps one frame per radar, so the cache key is the radar id alone and query strings can't force KV reads.
 * `?t=<frame time>` only decides whether the cached copy is new enough: a newer `t` re-reads the bundle at most once
 * per INGEST.radarRecheckSeconds.
 */
app.get('/v1/radar/:id', async (c) => {
  const id = c.req.param('id');
  if (!Object.hasOwn(RADARS, id)) return c.json({ error: 'unknown radar' }, 404);
  const wanted = Date.parse(c.req.query('t') ?? '');
  const key = cacheKey(c, `/v1/radar/${id}`);
  const cache = caches.default;
  let stored = await cache.match(key);
  const recheck =
    stored &&
    wanted > Date.parse(stored.headers.get('x-radar-time') ?? '') &&
    Date.now() - Number(stored.headers.get(RADAR_CHECKED) ?? 0) > INGEST.radarRecheckSeconds * 1000;
  if (!stored || recheck) {
    const bundle = await c.env.SNAPSHOTS.get(KEYS.radarBundle, 'arrayBuffer');
    const found = bundle ? unpackRadar(bundle, id) : null;
    if (found) {
      stored = new Response(found.png, {
        headers: {
          'content-type': 'image/png',
          'cache-control': `public, max-age=${INGEST.cacheSeconds.radar}`,
          'x-radar-time': found.entry.time,
          [RADAR_CHECKED]: String(Date.now()),
        },
      });
      c.executionCtx.waitUntil(cache.put(key, stored.clone()));
    }
  }
  if (!stored) return c.json({ error: 'no image yet' }, 404);
  const time = stored.headers.get('x-radar-time') ?? '';
  // An image older than the frame asked for must not stick in the browser cache under the newer URL.
  const behind = wanted > Date.parse(time);
  return new Response(stored.body, {
    headers: {
      'content-type': 'image/png',
      'cache-control': behind ? 'no-store' : `public, max-age=${INGEST.cacheSeconds.radar}`,
      'x-radar-time': time,
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'x-radar-time',
    },
  });
});

app.get('/v1/push/key', (c) => c.json({ publicKey: c.env.VAPID_PUBLIC_KEY }));

async function limited(c: Context<{ Bindings: Env }>, action: PushAction) {
  const rl = await rateLimit(c.env, c.req.header('cf-connecting-ip') ?? '', action);
  return rl.ok ? null : c.json({ error: 'too many requests' }, 429, { 'retry-after': String(rl.retryAfter) });
}

app.post('/v1/push/subscribe', async (c) => {
  const tooMany = await limited(c, 'subscribe');
  if (tooMany) return tooMany;
  const body = await readJsonBody(c.req.raw);
  if (!body.ok) return c.json({ error: body.error }, body.status);
  const sub = parseSubscribeBody(body.value);
  if (!sub.ok) return c.json({ error: sub.error }, sub.status);
  const id = await upsertSubscription(c.env.PUSH_DB, sub.value, new Date());
  return c.json({ ok: true, id });
});

app.post('/v1/push/unsubscribe', async (c) => {
  const tooMany = await limited(c, 'unsubscribe');
  if (tooMany) return tooMany;
  const body = await readJsonBody(c.req.raw);
  if (!body.ok) return c.json({ error: body.error }, body.status);
  const endpoint = parseEndpointBody(body.value);
  if (!endpoint.ok) return c.json({ error: endpoint.error }, endpoint.status);
  await deleteSubscription(c.env.PUSH_DB, await subscriptionId(endpoint.value));
  return c.json({ ok: true });
});

app.post('/v1/push/test', async (c) => {
  const tooMany = await limited(c, 'test');
  if (tooMany) return tooMany;
  const body = await readJsonBody(c.req.raw);
  if (!body.ok) return c.json({ error: body.error }, body.status);
  const endpoint = parseEndpointBody(body.value);
  if (!endpoint.ok) return c.json({ error: endpoint.error }, endpoint.status);
  const sub = await getSubscription(c.env.PUSH_DB, await subscriptionId(endpoint.value));
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
  await recordDelivery(c.env.PUSH_DB, sub, result);
  if (result === 'sent') await markSent(c.env.PUSH_DB, sub.id, 'test', now).run();
  return c.json({ result });
});

app.use('/ingest/*', async (c, next) => {
  if (!(await tokenMatches(c.req.header('authorization') ?? '', c.env.INGEST_TOKEN))) return c.json({ error: 'unauthorized' }, 401);
  const size = Number(c.req.header('content-length') ?? 0);
  if (size > INGEST.maxUploadBytes) return c.json({ error: 'payload too large' }, 413);
  await next();
});

app.post('/ingest/run-edge', async (c) => {
  const snapshot = await runEdgeFeeds(c.env);
  return c.json(Object.fromEntries(Object.entries(snapshot.feeds).map(([name, r]) => [name, { ok: r!.ok, items: r!.items.length, error: r!.error }])));
});

app.post('/ingest/runner', async (c) => {
  const body = await readJsonBody(c.req.raw, INGEST.maxUploadBytes);
  if (!body.ok) return c.json({ error: body.error }, body.status);
  const now = new Date();
  const parsed = parseRunnerPayload(body.value, now);
  // Reasons can quote item values, so only the first few are logged.
  if (parsed.dropped.length) console.log('runner dropped', parsed.dropped.length, JSON.stringify(parsed.dropped.slice(0, 10)));
  if (!parsed.ok) return c.json({ error: parsed.error, dropped: parsed.dropped.length }, 400);
  const prev = await readGroup(c.env.SNAPSHOTS, KEYS.runner);
  const jump = suspiciousJump(prev?.feeds, parsed.feeds, DISTRICTS, now);
  if (jump.suspicious) console.log('runner push held', JSON.stringify({ newDanger: jump.newDanger.length, districtsWithData: jump.districtsWithData }));
  const snapshot = await writeGroup(c.env.SNAPSHOTS, KEYS.runner, parsed.feeds, now, {
    prev,
    holdPushUntil: jump.suspicious ? new Date(now.getTime() + INGEST.pushHoldMinutes * 60_000) : undefined,
  });
  const held = isPushHeld(snapshot, now);
  if (!held) c.executionCtx.waitUntil(pushAfterUpdate(c.env, now));
  return c.json({ ok: true, feeds: Object.keys(snapshot.feeds), dropped: parsed.dropped.length, held });
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
