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
  type SourceResult,
  type ZoneFeature,
} from '@hw/core';
// District polygons built by tools/boundaries/build.py (shared with the web app and the push sender).
import districtsFile from '../../web/public/geo/districts.json';
import { EXT, type FeedKey } from './config';

export const DISTRICTS = (districtsFile as unknown as { features: ZoneFeature[] }).features;

/** Where the person is: a GPS fix, or the centre of a district they picked. */
export interface Place {
  location: LatLng;
  districtId: string;
  source: 'gps' | 'picked';
}

export interface AlertPrefs {
  kinds: PushKind[];
  pm25At: number;
}

export const districtById = (id: string) => DISTRICTS.find((d) => d.properties.id === id) ?? null;
export const districtAt = (p: LatLng) => DISTRICTS.find((d) => inZone(d, p)) ?? null;

/** Same alerts the web push sender builds for this district, before personal filtering. */
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

/** The person's own choices, as in apps/ingest/src/push/run.ts `wanted`. */
export function wantedAlerts(alerts: Alert[], prefs: AlertPrefs): Alert[] {
  const kinds = new Set(prefs.kinds);
  return alerts.filter((a) => kinds.has(a.kind) && (a.kind !== 'pm25' || (a.value ?? 0) >= prefs.pm25At));
}

export const alertSeverity = (alerts: Alert[]): Severity => worst(alerts.map((a) => a.severity));

export interface FeedStatus {
  key: FeedKey;
  state: 'ok' | 'stale' | 'failed';
  /** Last successful fetch, if known. */
  lastOkAt: string | null;
}

/** Health of each feed, judged like tools/monitor: by the age of its last successful fetch. */
export function feedStatuses(snapshot: DashboardSnapshot, now = new Date()): FeedStatus[] {
  const all = { ...snapshot.edge?.feeds, ...snapshot.runner?.feeds } as Partial<Record<FeedKey, SourceResult<unknown>>>;
  const group = (key: FeedKey) => (key in (snapshot.edge?.feeds ?? {}) ? 'edge' : 'runner');
  return EXT.feeds
    .filter((key) => all[key])
    .map((key) => {
      const r = all[key]!;
      const lastOkAt = r.lastOkAt ?? (r.ok ? r.fetchedAt : null);
      const tooOld = !lastOkAt || now.getTime() - Date.parse(lastOkAt) > EXT.feedMaxAgeMinutes[group(key)] * 60_000;
      return { key, lastOkAt, state: !r.ok ? 'failed' : tooOld ? 'stale' : 'ok' };
    });
}

/** Nearest live reading of a kind (offline, empty and stale readings are skipped). */
export function nearestLive(items: Observation[] | undefined, from: LatLng, cfg: AlertConfig = DEFAULT_CONFIG, now = new Date()) {
  let best: (Observation & { km: number }) | null = null;
  for (const o of items ?? []) {
    if (o.offline || o.value === null || isStale(o.observedAt, cfg, now)) continue;
    const km = distanceKm(from, o.location);
    if (!best || km < best.km) best = { ...o, km };
  }
  return best;
}

/** Live street-flood points inside the district (BMA only, so mostly Bangkok). */
export function floodInDistrict(snapshot: DashboardSnapshot, district: ZoneFeature, cfg: AlertConfig = DEFAULT_CONFIG, now = new Date()) {
  const live = (snapshot.runner?.feeds.flood?.items ?? []).filter((o) => !o.offline && !isStale(o.observedAt, cfg, now) && inZone(district, o.location));
  if (!live.length) return null;
  const flooded = live.filter((o) => rank(o.severity) >= rank('warn')).length;
  return { flooded, normal: live.length - flooded, severity: worst(live.map((o) => o.severity)) };
}
