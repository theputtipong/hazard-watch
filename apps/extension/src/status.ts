import {
  DEFAULT_CONFIG,
  districtAlerts,
  distanceKm,
  inZone,
  isStale,
  mergeQuakes,
  quakeAlerts,
  rank,
  worst,
  type Alert,
  type AlertConfig,
  type DashboardSnapshot,
  type LatLng,
  type Observation,
  type PushKind,
  type Severity,
  type ZoneFeature,
  buildZoneIndex,
  nasaNear,
  zoneAt,
  zoneCenter,
  type NasaNear,
  type ZoneIndex,
} from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';
// Lite outlines (~0.6 MB, full detail for Greater Bangkok) so GPS → district runs on the device and never leaves it.
import districtsFile from '../../web/public/geo/districts-lite.json';
// build.mjs strips the geometry from this one: only the names reach the bundle.
import provincesFile from '../../web/public/geo/provinces.json';

/** All 928 districts of the 77 provinces; ids match districts.json, so places saved before stay valid. */
export const DISTRICTS = (districtsFile as unknown as { features: ZoneFeature[] }).features;

export interface Province {
  id: string;
  /** Always null; kept so provinces and district props share one shape in pickers. */
  parent: null;
  name_th: string;
  name_en: string;
}

/** 77 provinces in pcode order (TH10 Bangkok first). */
export const PROVINCES: Province[] = (provincesFile as unknown as { features: { properties: Province }[] }).features.map(
  ({ properties: { id, name_th, name_en } }) => ({ id, parent: null, name_th, name_en }),
);

export interface Place {
  location: LatLng;
  districtId: string;
  source: 'gps' | 'picked';
}

export interface AlertPrefs {
  kinds: PushKind[];
  pm25At: number;
}

const byId = new Map(DISTRICTS.map((d) => [d.properties.id, d]));
export const districtById = (id: string) => byId.get(id) ?? null;

// Built on first use: the popup may never locate, and a cold service worker should not pay for it up front.
let index: ZoneIndex | null = null;
/** District containing the point, or null outside Thailand. */
export const districtAt = (p: LatLng) => zoneAt((index ??= buildZoneIndex(DISTRICTS)), p);

/** Districts of one province, sorted by name in the given language. */
export function districtsIn(provinceId: string, lang: Lang): ZoneFeature[] {
  const key = lang === 'th' ? 'name_th' : 'name_en';
  return DISTRICTS.filter((d) => d.properties.parent === provinceId).sort((a, b) =>
    a.properties[key].localeCompare(b.properties[key], lang),
  );
}

export const provinceOf = (district: ZoneFeature) => PROVINCES.find((p) => p.id === district.properties.parent) ?? null;

/** Where a picked district "is": its bbox centre, the same point the API uses for /v1/area. */
export const districtCenter = (district: ZoneFeature): LatLng => zoneCenter(district);

/** Must match the web push sender's alerts, before personal filtering. */
export function localAlerts(snapshot: DashboardSnapshot, district: ZoneFeature, cfg: AlertConfig = DEFAULT_CONFIG, now = new Date()): Alert[] {
  const readings: Observation[] = [
    ...(snapshot.runner?.feeds.flood?.items ?? []),
    ...(snapshot.runner?.feeds.rain?.items ?? []),
    ...(snapshot.runner?.feeds.waterlevel?.items ?? []),
    ...(snapshot.edge?.feeds.pm25?.items ?? []),
  ];
  const area = districtAlerts(readings, [district], cfg, now).get(district.properties.id) ?? [];
  const quakes = mergeQuakes(snapshot.edge?.feeds.quakesTmd?.items ?? [], snapshot.edge?.feeds.quakesUsgs?.items ?? [], cfg);
  return [...area, ...quakeAlerts(quakes, district, cfg, now)].sort((a, b) => rank(b.severity) - rank(a.severity));
}

/** Must match apps/ingest/src/push/run.ts `wanted`. */
export function wantedAlerts(alerts: Alert[], prefs: AlertPrefs): Alert[] {
  const kinds = new Set(prefs.kinds);
  return alerts.filter((a) => kinds.has(a.kind) && (a.kind !== 'pm25' || (a.value ?? 0) >= prefs.pm25At));
}

export const alertSeverity = (alerts: Alert[]): Severity => worst(alerts.map((a) => a.severity));

export function nearestLive(items: Observation[] | undefined, from: LatLng, cfg: AlertConfig = DEFAULT_CONFIG, now = new Date()) {
  let best: (Observation & { km: number }) | null = null;
  for (const o of items ?? []) {
    if (o.offline || o.value === null || isStale(o.observedAt, cfg, now)) continue;
    const km = distanceKm(from, o.location);
    if (!best || km < best.km) best = { ...o, km };
  }
  return best;
}

/** BMA data only, so effectively Bangkok. */
export function floodInDistrict(snapshot: DashboardSnapshot, district: ZoneFeature, cfg: AlertConfig = DEFAULT_CONFIG, now = new Date()) {
  const live = (snapshot.runner?.feeds.flood?.items ?? []).filter((o) => !o.offline && !isStale(o.observedAt, cfg, now) && inZone(district, o.location));
  if (!live.length) return null;
  const flooded = live.filter((o) => rank(o.severity) >= rank('warn')).length;
  return { flooded, normal: live.length - flooded, severity: worst(live.map((o) => o.severity)) };
}

/** NASA fires/events near a point, or null when the snapshot carries neither feed. */
export function nasaNearPoint(snapshot: DashboardSnapshot, from: LatLng, now = new Date()): NasaNear | null {
  const fires = snapshot.runner?.feeds.fires;
  const events = snapshot.runner?.feeds.events;
  if (!fires && !events) return null;
  return nasaNear(fires?.items ?? [], events?.items ?? [], from, now);
}

/**
 * At most two lines for the popup: the fire count (or "none") and the nearest open event.
 * Display only, never notified: satellite data lags hours. Empty when the snapshot has no NASA feeds.
 * `from` defaults to the district centre; pass the GPS point when the place came from GPS.
 */
export function nasaLines(
  snapshot: DashboardSnapshot,
  district: ZoneFeature,
  lang: Lang,
  { from = zoneCenter(district), now = new Date() }: { from?: LatLng; now?: Date } = {},
): string[] {
  const near = nasaNearPoint(snapshot, from, now);
  if (!near) return [];
  const lines: string[] = [];
  // A missing fires feed says nothing about fires, so only claim "none" when the feed is there.
  if (near.fires.count > 0) lines.push(t('nasa.fires.count', lang, { n: near.fires.count.toLocaleString(), km: near.fires.radiusKm }));
  else if (snapshot.runner?.feeds.fires) lines.push(t('nasa.fires.none', lang));
  const e = near.events[0];
  if (e) lines.push(`${t(`nasa.event.${e.category}`, lang)} ${e.title} · ${t('nasa.event.km', lang, { km: Math.round(e.km).toLocaleString() })}`);
  return lines;
}
