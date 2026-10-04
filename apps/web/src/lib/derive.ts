import {
  distanceKm,
  quakeSeverity,
  worst,
  type AlertConfig,
  type DashboardSnapshot,
  type Earthquake,
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

/** USGS and TMD often report the same event; keep one per ~minute/~50 km, preferring TMD (Thai text). */
export function mergeQuakes(tmd: Earthquake[], usgs: Earthquake[]): Earthquake[] {
  const out = [...tmd];
  for (const q of usgs) {
    const dup = tmd.some(
      (t) => Math.abs(new Date(t.occurredAt).getTime() - new Date(q.occurredAt).getTime()) < 90_000 && distanceKm(t.location, q.location) < 50,
    );
    if (!dup) out.push(q);
  }
  return out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function quakeSummary(snapshot: DashboardSnapshot | null, from: LatLng, cfg: AlertConfig, now = new Date()) {
  const all = mergeQuakes(snapshot?.edge?.feeds.quakesTmd?.items ?? [], snapshot?.edge?.feeds.quakesUsgs?.items ?? []);
  const since = now.getTime() - cfg.quake.lookbackHours * 3_600_000;
  const recent = all.filter((q) => new Date(q.occurredAt).getTime() >= since);
  const alerts = recent
    .map((q) => ({ quake: q, severity: quakeSeverity(q, from, cfg), km: distanceKm(from, q.location) }))
    .filter((x) => x.severity !== 'ok');
  const regional = recent
    .map((q) => ({ quake: q, km: distanceKm(from, q.location) }))
    .filter((x) => x.km <= cfg.quake.radiusKm);
  return { alerts, latestRegional: regional[0] ?? null, severity: worst(alerts.map((a) => a.severity)) as Severity };
}

export function isFresh(iso: string | undefined, maxMinutes: number, now = new Date()): boolean {
  return !!iso && now.getTime() - new Date(iso).getTime() <= maxMinutes * 60_000;
}
