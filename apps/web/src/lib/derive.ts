import {
  distanceKm,
  mergeQuakes,
  quakeAlertFloor,
  quakeSeverity,
  worst,
  type AlertConfig,
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
