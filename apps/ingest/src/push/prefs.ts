import { DEFAULT_CONFIG, personalQuakeLimit, pickChoice, type AlertConfig, type PushKind, type QuakeLimit } from '@hw/core';
import type { SubscriptionPrefs, SubscriptionRow } from './store';

export interface IncomingPrefs {
  kinds?: unknown;
  pm25At?: unknown;
  quakeMinMag?: unknown;
  quakeMaxKm?: unknown;
}

export interface CleanPrefs {
  prefs: SubscriptionPrefs;
  /** null = central quake tiers. */
  quakeMinMag: number | null;
  quakeMaxKm: number | null;
}

export function cleanPrefs(input: IncomingPrefs | undefined, cfg: AlertConfig = DEFAULT_CONFIG): CleanPrefs {
  const known = new Set<PushKind>(cfg.push.kinds);
  const kinds = (Array.isArray(input?.kinds) ? input.kinds : []).filter((k): k is PushKind => known.has(k as PushKind));
  const pm25At = Number(input?.pm25At);
  return {
    prefs: { kinds, ...(Number.isFinite(pm25At) && pm25At > 0 && pm25At < 1000 ? { pm25At } : {}) },
    quakeMinMag: pickChoice(input?.quakeMinMag, cfg.push.quakeChoices.minMagnitude),
    quakeMaxKm: pickChoice(input?.quakeMaxKm, cfg.push.quakeChoices.maxDistanceKm),
  };
}

/** Re-checked against config so a since-removed choice falls back to the default. */
export function quakeLimitFor(sub: Pick<SubscriptionRow, 'quake_min_mag' | 'quake_max_km'>, cfg: AlertConfig = DEFAULT_CONFIG): QuakeLimit {
  return personalQuakeLimit(cfg, { minMagnitude: sub.quake_min_mag ?? null, maxDistanceKm: sub.quake_max_km ?? null });
}
