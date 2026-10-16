import {
  DEFAULT_CONFIG,
  FIRE_BOUNDS,
  groupByZone,
  isStale,
  RADARS,
  SEVERITIES,
  type AlertConfig,
  type CctvCamera,
  type FireHotspot,
  type HazardKind,
  type LatLng,
  type LocalizedText,
  type NasaEvent,
  type NasaEventCategory,
  type Observation,
  type RadarFrame,
  type SourceId,
  type SourceResult,
  type ZoneFeature,
  type ZoneIndex,
} from '@hw/core';
import { ENDPOINTS, EVENT_CAP, FIRE_CAP, TRACK_CAP, type RunnerFeed } from '@hw/sources';
import type { FeedMap } from './store';

// Anyone holding INGEST_TOKEN can write these feeds, and they reach every push subscriber and the web/app UI.
// Rebuild each item from known fields only, so stray properties never reach KV.

/** Thailand spans ~5.6–20.5 N, 97.3–105.6 E; about 1° of margin. */
const THAILAND = { minLat: 4.5, maxLat: 21.5, minLng: 96.5, maxLng: 106.5 };

const MAX = {
  id: 128,
  name: 200,
  unit: 16,
  error: 500,
  url: 2048,
  extraKeys: 16,
  extraKey: 32,
  extraString: 200,
  feedKeys: 20,
  /** Allowed clock skew for timestamps ahead of the worker's clock. */
  futureMs: 12 * 3_600_000,
  /** Runner uploads right after fetching; older `fetchedAt` means a replayed or broken payload. */
  fetchedAgeMs: 24 * 3_600_000,
  /** More invalid items than this share drops the whole feed, so the previous good snapshot stays. */
  droppedShare: 0.5,
} as const;

/** Wider than anything seen from the sources, narrow enough to stop absurd values driving alerts. */
const VALUE_RANGE: Record<'flood' | 'rain' | 'waterlevel', [number, number]> = {
  flood: [-50, 500], // cm of water
  rain: [0, 400], // mm in the last hour
  waterlevel: [-100, 500], // % of bank-full
};

const EXTRA_RANGE: Record<string, [number, number]> = {
  rain24h: [0, 2000],
  msl: [-100, 3000],
  subStatus: [0, 9],
};

const RADAR_IMAGE_ORIGINS = new Set([new URL(ENDPOINTS.thaiwaterBase).origin]);
// BMA Traffic serves cameras over plain http only, so its exact http origin is the single non-https exception.
const CCTV_ORIGINS = new Set([new URL(ENDPOINTS.bmaTrafficSession).origin, 'https://www.bmatraffic.com']);

type ItemCheck = (raw: unknown, now: Date) => unknown;

interface FeedSpec {
  source: SourceId;
  maxItems: number;
  item: ItemCheck;
}

class Invalid extends Error {}

const fail = (reason: string): never => {
  throw new Invalid(reason);
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function str(v: unknown, field: string, max: number): string {
  if (typeof v !== 'string' || !v.length) return fail(`${field}: expected non-empty string`);
  if (v.length > max) return fail(`${field}: longer than ${max}`);
  return v;
}

function num(v: unknown, field: string, [min, max]: [number, number]): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fail(`${field}: expected finite number`);
  if (v < min || v > max) return fail(`${field}: ${v} outside ${min}..${max}`);
  return v;
}

function time(v: unknown, field: string, now: Date): string {
  const s = str(v, field, 40);
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return fail(`${field}: not a date`);
  if (ms > now.getTime() + MAX.futureMs) return fail(`${field}: in the future`);
  return s;
}

function text(v: unknown, field: string): LocalizedText {
  if (!isRecord(v)) return fail(`${field}: expected {th, en}`);
  return { th: str(v.th, `${field}.th`, MAX.name), en: str(v.en, `${field}.en`, MAX.name) };
}

type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };
/** EONET events are worldwide (world map layer), so only the globe limits them. */
const WORLD: Bounds = { minLat: -90, maxLat: 90, minLng: -180, maxLng: 180 };

function location(v: unknown, field = 'location', box: Bounds = THAILAND): LatLng {
  if (!isRecord(v)) return fail(`${field}: expected {lat, lng}`);
  return {
    lat: num(v.lat, `${field}.lat`, [box.minLat, box.maxLat]),
    lng: num(v.lng, `${field}.lng`, [box.minLng, box.maxLng]),
  };
}

function url(v: unknown, field: string, origins: Set<string> | 'https'): string {
  const s = str(v, field, MAX.url);
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return fail(`${field}: not a URL`);
  }
  // EONET links point at many agencies (JTWC, NHC, Smithsonian...), so those are limited to https rather than a host list.
  const allowed = origins === 'https' ? u.protocol === 'https:' : origins.has(u.origin);
  if (u.username || u.password || !allowed) return fail(`${field}: host not allowed`);
  return u.href;
}

function extra(v: unknown): Observation['extra'] {
  if (v === undefined) return undefined;
  if (!isRecord(v)) return fail('extra: expected object');
  const entries = Object.entries(v);
  if (entries.length > MAX.extraKeys) return fail('extra: too many keys');
  const out: NonNullable<Observation['extra']> = {};
  for (const [key, value] of entries) {
    if (key.length > MAX.extraKey) return fail('extra: key too long');
    if (value === null || typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number') out[key] = num(value, `extra.${key}`, EXTRA_RANGE[key] ?? [-1e9, 1e9]);
    else if (typeof value === 'string') out[key] = str(value, `extra.${key}`, MAX.extraString);
    else return fail(`extra.${key}: unsupported type`);
  }
  return out;
}

function observation(kind: 'flood' | 'rain' | 'waterlevel', source: SourceId): ItemCheck {
  return (raw, now) => {
    if (!isRecord(raw)) return fail('item: expected object');
    if (raw.kind !== kind) return fail(`kind: expected ${kind}`);
    if (raw.source !== source) return fail(`source: expected ${source}`);
    if (!SEVERITIES.includes(raw.severity as Observation['severity'])) return fail('severity: unknown');
    if (raw.offline !== undefined && typeof raw.offline !== 'boolean') return fail('offline: expected boolean');
    const out: Observation = {
      id: str(raw.id, 'id', MAX.id),
      kind: kind satisfies HazardKind,
      source,
      name: text(raw.name, 'name'),
      location: location(raw.location),
      observedAt: time(raw.observedAt, 'observedAt', now),
      value: raw.value === null ? null : num(raw.value, 'value', VALUE_RANGE[kind]),
      unit: str(raw.unit, 'unit', MAX.unit),
      severity: raw.severity as Observation['severity'],
    };
    if (raw.offline !== undefined) out.offline = raw.offline;
    const ex = extra(raw.extra);
    if (ex) out.extra = ex;
    return out;
  };
}

const radarFrame: ItemCheck = (raw, now) => {
  if (!isRecord(raw)) return fail('item: expected object');
  if (raw.source !== 'thaiwater') return fail('source: expected thaiwater');
  const radarId = str(raw.radarId, 'radarId', MAX.id);
  if (!Object.hasOwn(RADARS, radarId)) return fail('radarId: unknown radar');
  const out: RadarFrame = { radarId, source: 'thaiwater', time: time(raw.time, 'time', now), imageUrl: url(raw.imageUrl, 'imageUrl', RADAR_IMAGE_ORIGINS) };
  if (raw.echoPixels !== undefined) out.echoPixels = num(raw.echoPixels, 'echoPixels', [0, 50_000_000]);
  return out;
};

const camera: ItemCheck = (raw) => {
  if (!isRecord(raw)) return fail('item: expected object');
  if (raw.source !== 'bma-traffic') return fail('source: expected bma-traffic');
  const out: CctvCamera = {
    id: str(raw.id, 'id', MAX.id),
    source: 'bma-traffic',
    name: text(raw.name, 'name'),
    location: location(raw.location),
    viewUrl: url(raw.viewUrl, 'viewUrl', CCTV_ORIGINS),
  };
  if (raw.sessionUrl !== undefined) out.sessionUrl = url(raw.sessionUrl, 'sessionUrl', CCTV_ORIGINS);
  return out;
};

const FIRE_CONFIDENCE: readonly FireHotspot['confidence'][] = ['low', 'nominal', 'high'];
const FIRE_SATELLITES: readonly FireHotspot['satellite'][] = ['N20', 'N21', 'SNPP', 'MODIS'];
const EVENT_CATEGORIES: readonly NasaEventCategory[] = ['severeStorms', 'volcanoes', 'floods', 'landslides'];
/** Largest single-pixel FRP on record is a few thousand MW; this only stops absurd values. */
const FRP_RANGE: [number, number] = [0, 50_000];
/** Strongest cyclones peak near 190 kts. */
const WIND_KTS_RANGE: [number, number] = [0, 300];

const fire: ItemCheck = (raw, now) => {
  if (!isRecord(raw)) return fail('item: expected object');
  if (!FIRE_CONFIDENCE.includes(raw.confidence as FireHotspot['confidence'])) return fail('confidence: unknown');
  if (!FIRE_SATELLITES.includes(raw.satellite as FireHotspot['satellite'])) return fail('satellite: unknown');
  if (typeof raw.day !== 'boolean') return fail('day: expected boolean');
  return {
    id: str(raw.id, 'id', MAX.id),
    location: location(raw.location, 'location', FIRE_BOUNDS),
    detectedAt: time(raw.detectedAt, 'detectedAt', now),
    frp: raw.frp === null ? null : num(raw.frp, 'frp', FRP_RANGE),
    confidence: raw.confidence as FireHotspot['confidence'],
    satellite: raw.satellite as FireHotspot['satellite'],
    day: raw.day,
  } satisfies FireHotspot;
};

const nasaEvent: ItemCheck = (raw, now) => {
  if (!isRecord(raw)) return fail('item: expected object');
  if (!EVENT_CATEGORIES.includes(raw.category as NasaEventCategory)) return fail('category: unknown');
  if (!Array.isArray(raw.track)) return fail('track: expected array');
  if (raw.track.length > TRACK_CAP) return fail(`track: more than ${TRACK_CAP} points`);
  const track = raw.track.map((p, i) => {
    if (!isRecord(p)) return fail(`track[${i}]: expected object`);
    return {
      at: time(p.at, `track[${i}].at`, now),
      location: location(p.location, `track[${i}].location`, WORLD),
      windKts: p.windKts === null ? null : num(p.windKts, `track[${i}].windKts`, WIND_KTS_RANGE),
    };
  });
  return {
    id: str(raw.id, 'id', MAX.id),
    category: raw.category as NasaEventCategory,
    title: str(raw.title, 'title', MAX.name),
    location: location(raw.location, 'location', WORLD),
    track,
    updatedAt: time(raw.updatedAt, 'updatedAt', now),
    url: raw.url === null ? null : url(raw.url, 'url', 'https'),
  } satisfies NasaEvent;
};

export const RUNNER_SPEC: Record<RunnerFeed, FeedSpec> = {
  flood: { source: 'bma-flood', maxItems: 2000, item: observation('flood', 'bma-flood') },
  rain: { source: 'bma-rain', maxItems: 2000, item: observation('rain', 'bma-rain') },
  waterlevel: { source: 'thaiwater', maxItems: 5000, item: observation('waterlevel', 'thaiwater') },
  radar: { source: 'thaiwater', maxItems: 100, item: radarFrame },
  cctv: { source: 'bma-traffic', maxItems: 5000, item: camera },
  // Display only: not in ALERT_FEEDS, so they never drive pushes or suspiciousJump.
  fires: { source: 'nasa-firms', maxItems: FIRE_CAP, item: fire },
  events: { source: 'nasa-eonet', maxItems: EVENT_CAP, item: nasaEvent },
};

export interface Dropped {
  feed: string;
  /** Item id when it was readable. */
  id?: string;
  reason: string;
}

export type RunnerPayload = { ok: true; feeds: FeedMap; dropped: Dropped[] } | { ok: false; error: string; dropped: Dropped[] };

function feedResult(name: RunnerFeed, raw: unknown, now: Date, dropped: Dropped[]): SourceResult<unknown> {
  const spec = RUNNER_SPEC[name];
  if (!isRecord(raw)) return fail('expected object');
  if (raw.source !== spec.source) return fail(`source: expected ${spec.source}`);
  if (typeof raw.ok !== 'boolean') return fail('ok: expected boolean');
  if (!Array.isArray(raw.items)) return fail('items: expected array');
  if (raw.items.length > spec.maxItems) return fail(`items: more than ${spec.maxItems}`);
  const fetchedAt = time(raw.fetchedAt, 'fetchedAt', now);
  if (Date.parse(fetchedAt) < now.getTime() - MAX.fetchedAgeMs) return fail('fetchedAt: too old');
  if (raw.error !== undefined && typeof raw.error !== 'string') return fail('error: expected string');

  const items: unknown[] = [];
  const bad: Dropped[] = [];
  for (const item of raw.items) {
    try {
      items.push(spec.item(item, now));
    } catch (err) {
      if (!(err instanceof Invalid)) throw err;
      const id = isRecord(item) && typeof item.id === 'string' ? item.id.slice(0, MAX.id) : undefined;
      bad.push({ feed: name, ...(id ? { id } : {}), reason: err.message });
    }
  }
  dropped.push(...bad);
  if (bad.length && bad.length > raw.items.length * MAX.droppedShare) return fail(`${bad.length}/${raw.items.length} items invalid`);

  // lastOkAt / failingSince are the store's to set, so they are not copied.
  const out: SourceResult<unknown> = { source: spec.source, fetchedAt, ok: raw.ok, items };
  if (typeof raw.error === 'string') out.error = raw.error.slice(0, MAX.error);
  return out;
}

/**
 * Checks a `/ingest/runner` body. Bad items or feeds are dropped and listed so the rest still flows;
 * the payload is refused only when its shape is wrong or nothing usable is left.
 */
export function parseRunnerPayload(raw: unknown, now: Date = new Date()): RunnerPayload {
  const dropped: Dropped[] = [];
  if (!isRecord(raw) || !isRecord(raw.feeds)) return { ok: false, error: 'payload must be { feeds: { ... } }', dropped };
  const names = Object.keys(raw.feeds);
  if (names.length > MAX.feedKeys) return { ok: false, error: 'too many feeds', dropped };

  const feeds: FeedMap = {};
  for (const name of names) {
    if (!Object.hasOwn(RUNNER_SPEC, name)) {
      dropped.push({ feed: name.slice(0, 40), reason: 'unknown feed' });
      continue;
    }
    try {
      feeds[name as RunnerFeed] = feedResult(name as RunnerFeed, raw.feeds[name], now, dropped);
    } catch (err) {
      if (!(err instanceof Invalid)) throw err;
      dropped.push({ feed: name, reason: `feed dropped: ${err.message}` });
    }
  }
  if (!Object.keys(feeds).length) return { ok: false, error: 'no valid feeds in payload', dropped };
  return { ok: true, feeds, dropped };
}

/**
 * A real storm raises districts over hours across several runs; most of the map turning "danger" in one upload
 * points to a forged or broken payload. Both limits must be crossed, so a heavy storm over a few districts still alerts.
 */
export const JUMP_LIMITS = {
  /** Districts that were below danger in the previous snapshot and are danger now. */
  minNewDanger: 10,
  /** ...as a share of districts that have fresh readings now. */
  minShare: 0.5,
} as const;

export interface JumpVerdict {
  suspicious: boolean;
  newDanger: string[];
  districtsWithData: number;
}

const ALERT_FEEDS = ['flood', 'rain', 'waterlevel'] as const;

function readings(feeds: FeedMap, cfg: AlertConfig, now: Date): Observation[] {
  return ALERT_FEEDS.flatMap((name) => (feeds[name]?.items ?? []) as Observation[]).filter(
    (o) => !o.offline && o.value !== null && !isStale(o.observedAt, cfg, now),
  );
}

function dangerByDistrict(list: Observation[], districts: ZoneFeature[] | ZoneIndex) {
  const groups = groupByZone(list, districts);
  const withData = [...groups].filter(([, inside]) => inside.length).map(([id]) => id);
  const danger = new Set(withData.filter((id) => groups.get(id)!.some((o) => o.severity === 'danger')));
  return { withData, danger };
}

/**
 * Compares the stored runner snapshot with an incoming one (as the store will merge it: feeds that failed keep
 * their previous items). No fresh baseline, e.g. after an outage, is never suspicious: there is nothing to compare.
 */
export function suspiciousJump(
  prev: FeedMap | null | undefined,
  next: FeedMap,
  districts: ZoneFeature[] | ZoneIndex,
  now: Date = new Date(),
  limits: { minNewDanger: number; minShare: number } = JUMP_LIMITS,
  cfg: AlertConfig = DEFAULT_CONFIG,
): JumpVerdict {
  const merged: FeedMap = { ...(prev ?? {}) };
  for (const name of ALERT_FEEDS) if (next[name]?.ok) merged[name] = next[name];

  const before = dangerByDistrict(readings(prev ?? {}, cfg, now), districts);
  const after = dangerByDistrict(readings(merged, cfg, now), districts);
  const newDanger = [...after.danger].filter((id) => !before.danger.has(id));
  const suspicious =
    before.withData.length > 0 && newDanger.length >= limits.minNewDanger && newDanger.length >= after.withData.length * limits.minShare;
  return { suspicious, newDanger, districtsWithData: after.withData.length };
}
