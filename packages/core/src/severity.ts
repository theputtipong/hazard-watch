import type { AlertConfig } from './config';
import { distanceKm } from './geo';
import { SEVERITIES, type Earthquake, type LatLng, type Severity } from './types';

export function rank(s: Severity): number {
  return SEVERITIES.indexOf(s);
}

export function worst(list: Iterable<Severity>): Severity {
  let out: Severity = 'ok';
  for (const s of list) if (rank(s) > rank(out)) out = s;
  return out;
}

export function pm25Severity(value: number, cfg: AlertConfig): Severity {
  const { ok, watch, warn } = cfg.pm25.bands;
  if (value <= ok) return 'ok';
  if (value <= watch) return 'watch';
  if (value <= warn) return 'warn';
  return 'danger';
}

export function pm25ShouldPush(value: number, cfg: AlertConfig): boolean {
  return value >= cfg.pm25.pushAt;
}

export function rainSeverity(mmPerHour: number, cfg: AlertConfig): Severity {
  const r = cfg.rain;
  if (mmPerHour >= r.dangerMmPerHour) return 'danger';
  if (mmPerHour >= r.warnMmPerHour) return 'warn';
  if (mmPerHour >= r.watchMmPerHour) return 'watch';
  return 'ok';
}

export function waterLevelSeverity(bankFullPct: number, cfg: AlertConfig): Severity {
  const w = cfg.waterLevel;
  if (bankFullPct >= w.dangerPct) return 'danger';
  if (bankFullPct >= w.warnPct) return 'warn';
  if (bankFullPct >= w.watchPct) return 'watch';
  return 'ok';
}

/** BMA flood point: subStatus 1 normal, 2 minor flooding, 3 flooded. */
export function bmaFloodSeverity(subStatus: number, depthCm: number | null, cfg: AlertConfig): Severity {
  if (subStatus === 3) return depthCm !== null && depthCm >= cfg.flood.dangerDepthCm ? 'danger' : 'warn';
  if (subStatus === 2) return 'watch';
  return 'ok';
}

export function quakeSeverity(q: Earthquake, from: LatLng, cfg: AlertConfig): Severity {
  const km = distanceKm(from, q.location);
  if (km > cfg.quake.radiusKm || q.magnitude < cfg.quake.minMagnitude) return 'ok';
  return q.magnitude >= cfg.quake.dangerMagnitude ? 'danger' : 'warn';
}

export function isStale(observedAt: string, cfg: AlertConfig, now: Date = new Date()): boolean {
  return now.getTime() - new Date(observedAt).getTime() > cfg.staleAfterMinutes * 60_000;
}
