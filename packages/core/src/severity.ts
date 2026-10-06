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

export function rainSeverity(mmPerHour: number, cfg: AlertConfig, mm24h?: number | null): Severity {
  const r = cfg.rain;
  const hourly: Severity =
    mmPerHour >= r.dangerMmPerHour ? 'danger' : mmPerHour >= r.warnMmPerHour ? 'warn' : mmPerHour >= r.watchMmPerHour ? 'watch' : 'ok';
  if (mm24h === null || mm24h === undefined) return hourly;
  const daily: Severity = mm24h >= r.danger24hMm ? 'danger' : mm24h >= r.warn24hMm ? 'warn' : mm24h >= r.watch24hMm ? 'watch' : 'ok';
  return worst([hourly, daily]);
}

export function waterLevelSeverity(bankFullPct: number, cfg: AlertConfig): Severity {
  const w = cfg.waterLevel;
  if (bankFullPct >= w.dangerPct) return 'danger';
  if (bankFullPct >= w.warnPct) return 'warn';
  if (bankFullPct >= w.watchPct) return 'watch';
  return 'ok';
}

export function bmaFloodSeverity(subStatus: number, depthCm: number | null, cfg: AlertConfig): Severity {
  const base = cfg.flood.bmaSubStatus[subStatus] ?? 'ok';
  if (base === 'ok') return 'ok';
  return depthCm !== null && depthCm >= cfg.flood.dangerDepthCm ? 'danger' : base;
}

export function quakeSeverity(q: Earthquake, from: LatLng, cfg: AlertConfig): Severity {
  const km = distanceKm(from, q.location);
  const tier = [...cfg.quake.tiers]
    .sort((a, b) => rank(b.severity) - rank(a.severity))
    .find((t) => q.magnitude >= t.minMagnitude && km <= t.maxDistanceKm);
  return tier?.severity ?? 'ok';
}

export function quakeAlertFloor(cfg: AlertConfig): { minMagnitude: number; maxDistanceKm: number } {
  const tiers = cfg.quake.tiers;
  if (!tiers.length) return { minMagnitude: Infinity, maxDistanceKm: 0 };
  return {
    minMagnitude: Math.min(...tiers.map((t) => t.minMagnitude)),
    maxDistanceKm: Math.max(...tiers.map((t) => t.maxDistanceKm)),
  };
}

export function isStale(observedAt: string, cfg: AlertConfig, now: Date = new Date()): boolean {
  return now.getTime() - new Date(observedAt).getTime() > cfg.staleAfterMinutes * 60_000;
}
