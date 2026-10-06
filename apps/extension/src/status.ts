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
} from '@hw/core';
import districtsFile from '../../web/public/geo/districts.json';

export const DISTRICTS = (districtsFile as unknown as { features: ZoneFeature[] }).features;

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
