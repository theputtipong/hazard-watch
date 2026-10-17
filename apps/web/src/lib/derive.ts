import {
  damSeverity,
  damStatus,
  distanceKm,
  FEED_TOPIC_MAX_AGE_MINUTES,
  mergeQuakes,
  quakeAlertFloor,
  quakeSeverity,
  worst,
  type AlertConfig,
  type DamExtra,
  type DamStatus,
  type DashboardSnapshot,
  type LatLng,
  type Observation,
  type Severity,
} from '@hw/core';

export function nearest<T extends { location: LatLng }>(items: T[], from: LatLng, limit = 1): (T & { km: number })[] {
  return items
    .map((it) => ({ ...it, km: distanceKm(from, it.location) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}

export function floodCounts(points: Observation[]) {
  const count = { flooded: 0, minor: 0, normal: 0, offline: 0 };
  for (const p of points) {
    if (p.offline) count.offline++;
    else if (p.severity === 'warn' || p.severity === 'danger') count.flooded++;
    else if (p.severity === 'watch') count.minor++;
    else count.normal++;
  }
  return count;
}

export function quakeSummary(snapshot: DashboardSnapshot | null, from: LatLng, cfg: AlertConfig, now = new Date()) {
  const all = mergeQuakes(snapshot?.edge?.feeds.quakesTmd?.items ?? [], snapshot?.edge?.feeds.quakesUsgs?.items ?? [], cfg);
  const since = now.getTime() - cfg.quake.lookbackHours * 3_600_000;
  const recent = all.filter((q) => new Date(q.occurredAt).getTime() >= since);
  const alerts = recent
    .map((q) => ({ quake: q, severity: quakeSeverity(q, from, cfg), km: distanceKm(from, q.location) }))
    .filter((x) => x.severity !== 'ok');
  const regional = recent
    .map((q) => ({ quake: q, km: distanceKm(from, q.location) }))
    .filter((x) => x.km <= quakeAlertFloor(cfg).maxDistanceKm);
  return { alerts, latestRegional: regional[0] ?? null, severity: worst(alerts.map((a) => a.severity)) as Severity };
}

export function isFresh(iso: string | undefined, maxMinutes: number, now = new Date()): boolean {
  return !!iso && now.getTime() - new Date(iso).getTime() <= maxMinutes * 60_000;
}

export function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((it) => {
    const k = key(it);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * How close a sensor must be for a local feed to speak for a place. Flood sensors and cameras are Bangkok-only:
 * past these distances their cards are left out instead of showing Bangkok's numbers as if they were local.
 */
export const LOCAL_KM = { flood: 20, cctv: 15, water: 60 } as const;

export function withinKm<T extends { location: LatLng }>(items: T[], from: LatLng, km: number): boolean {
  return items.some((it) => distanceKm(from, it.location) <= km);
}

/** One dam for the dam card and map popup; same shape as the ingest `/v1/area` DamReading. */
export interface DamReading {
  id: string;
  name: { th: string; en: string };
  size: DamExtra['size'];
  location: LatLng;
  km: number;
  storagePct: number;
  usablePct: number | null;
  storageMcm: number | null;
  capacityMcm: number | null;
  inflowMcm: number | null;
  releaseMcm: number | null;
  status: DamStatus;
  /** Display colour only: over → danger, high → watch, else ok. Dams never raise alerts. */
  severity: Severity;
  province: string;
  basin: string | null;
  observedAt: string;
  stale: boolean;
}

/** Same limits as apps/ingest/src/area.ts DAM_PICK, so the web card picks the dams the app's area report does. */
export const DAM_PICK = { max: 3, largeKm: 300, mediumKm: 50 } as const;

/** Same as ingest damStale: `observedAt` is 00:00 ICT of the report day, so the 36 h feed limit runs from the day's end. */
const DAM_STALE_MS = ((FEED_TOPIC_MAX_AGE_MINUTES.dams ?? 36 * 60) + 24 * 60) * 60_000;
export const damStale = (observedAt: string, now: Date): boolean => now.getTime() - Date.parse(observedAt) > DAM_STALE_MS;

export function damReading(o: Observation, from: LatLng | null, cfg: AlertConfig, now: Date): DamReading {
  const x = o.extra as DamExtra;
  const storagePct = o.value!;
  return {
    id: o.id,
    name: o.name,
    size: x.size,
    location: o.location,
    km: from ? Math.round(distanceKm(from, o.location) * 10) / 10 : 0,
    storagePct,
    usablePct: x.usablePct ?? null,
    storageMcm: x.storageMcm ?? null,
    capacityMcm: x.capacityMcm ?? null,
    inflowMcm: x.inflowMcm ?? null,
    releaseMcm: x.releaseMcm ?? null,
    status: damStatus(storagePct, x.usablePct, cfg),
    severity: damSeverity(storagePct, x.usablePct, cfg),
    province: x.province,
    basin: x.basin ?? null,
    observedAt: o.observedAt,
    stale: damStale(o.observedAt, now),
  };
}

export const isDam = (o: Observation): boolean => o.kind === 'dam' && o.value !== null && !!o.extra;

/**
 * Mirrors ingest pickDams: up to 3 dams, by priority (1) nearest large dam ≤ 300 km, (2) nearest medium reservoir
 * ≤ 50 km, (3) other large dams (≤ 300 km) in the same province or basin, then further medium ones ≤ 50 km;
 * returned nearest first. The basin is that of the nearest dam within 50 km.
 */
export function pickDams(items: Observation[], from: LatLng, province: string | null, cfg: AlertConfig, now = new Date()): DamReading[] {
  const all = items
    .filter(isDam)
    .map((o) => damReading(o, from, cfg, now))
    .sort((a, b) => a.km - b.km);
  const large = all.filter((d) => d.size === 'large' && d.km <= DAM_PICK.largeKm);
  const medium = all.filter((d) => d.size === 'medium' && d.km <= DAM_PICK.mediumKm);
  const basin = all.find((d) => d.km <= DAM_PICK.mediumKm && d.basin)?.basin ?? null;
  const related = large.filter((d) => (province && d.province === province) || (basin && d.basin === basin));
  const picked = new Map<string, DamReading>();
  for (const d of [large[0], medium[0], ...related, ...medium]) {
    if (picked.size >= DAM_PICK.max) break;
    if (d && !picked.has(d.id)) picked.set(d.id, d);
  }
  return [...picked.values()].sort((a, b) => a.km - b.km);
}
