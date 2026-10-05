import { DEFAULT_CONFIG, personalQuakeLimit, pickChoice, type AlertConfig, type PushKind, type QuakeLimit } from '@hw/core';
import type { SubscriptionPrefs, SubscriptionRow } from './store';

/** Personal settings as sent by the web app (untrusted). */
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

/** Keeps only known alert kinds, a sane PM2.5 level and quake values from the allowed choices (others become null). */
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

/** The quake limit for a stored subscription (re-checked against config, so a removed choice falls back to default). */
export function quakeLimitFor(sub: Pick<SubscriptionRow, 'quake_min_mag' | 'quake_max_km'>, cfg: AlertConfig = DEFAULT_CONFIG): QuakeLimit {
  return personalQuakeLimit(cfg, { minMagnitude: sub.quake_min_mag ?? null, maxDistanceKm: sub.quake_max_km ?? null });
}
