import type { HazardKind, Severity } from './types';

/**
 * Every value that changes how hazards are judged or displayed lives here, so it can be tuned
 * without touching logic. Both the ingest worker and the web app read this file, so after editing
 * it redeploy both (see TODO.md). Deployments may also override parts with mergeConfig().
 */
export interface AlertConfig {
  /** Units shown next to values. Change here only — adapters and UI read these. */
  units: {
    pm25: string;
    rain: string;
    floodDepth: string;
    waterLevel: string;
    temperature: string;
    precipitation: string;
    humidity: string;
    distance: string;
  };
  pm25: {
    /** Upper bound (in `units.pm25`) of each display band. Defaults: WHO 2021 guideline + interim targets. */
    bands: { ok: number; watch: number; warn: number };
    /** Push notification fires at or above this value. Default = Thai national 24h standard. */
    pushAt: number;
  };
  quake: {
    /**
     * Checked from the top; the first tier whose magnitude and distance match wins.
     * An event matching no tier is 'ok'. Add or remove tiers freely (e.g. a 'watch' tier for M5 within 500 km).
     */
    tiers: { severity: Exclude<Severity, 'ok'>; minMagnitude: number; maxDistanceKm: number }[];
    /** How far back the dashboard looks, in hours. */
    lookbackHours: number;
    /** USGS and TMD often report the same event; treat reports this close in time and space as one. */
    duplicateWithinSeconds: number;
    duplicateWithinKm: number;
  };
  flood: {
    /** BMA flood point `flood_sub_status` → severity. Codes not listed (1 normal, 0/5 offline) are 'ok'. */
    bmaSubStatus: Record<number, Severity>;
    /** Water depth (in `units.floodDepth`) at a flooded point that upgrades it to danger. */
    dangerDepthCm: number;
  };
  waterLevel: {
    /** Percent of bank-full at a river/canal gauge (ThaiWater storage_percent). */
    watchPct: number;
    warnPct: number;
    dangerPct: number;
  };
  rain: {
    /** Rain in the past hour (in `units.rain`). ⚠️ Estimates; not yet tied to an official standard. */
    watchMmPerHour: number;
    warnMmPerHour: number;
    dangerMmPerHour: number;
  };
  zones: {
    /** Which point readings decide a zone's colour. Earthquakes are regional, so they are not zoned. */
    kinds: HazardKind[];
    /** How a zone's status is derived from the points inside it. Only 'worst' exists for now. */
    aggregate: 'worst';
  };
  push: {
    /** Hazards that can trigger a push. Users can switch each off for themselves. */
    kinds: PushKind[];
    /** Don't repeat the same alert (same hazard, same area) to the same person within this many hours. */
    cooldownHours: number;
    /** Maximum notifications sent per run (keeps one run inside Worker limits). */
    maxPerRun: number;
    /** How long a push service should keep trying to deliver (seconds). */
    ttlSeconds: number;
    /**
     * Earthquake alert levels a person may pick for themselves (the server rejects anything else).
     * Not picked = the quake tiers above (smallest tier magnitude, widest tier radius).
     */
    quakeChoices: { minMagnitude: number[]; maxDistanceKm: number[] };
  };
  /** Readings older than this are shown as stale and ignored for alerts. */
  staleAfterMinutes: number;
}

export type PushKind = 'flood' | 'rain' | 'water' | 'pm25' | 'quake';

export const DEFAULT_CONFIG: AlertConfig = {
  units: {
    pm25: 'µg/m³',
    rain: 'mm/h',
    floodDepth: 'cm',
    waterLevel: '%',
    temperature: '°C',
    precipitation: 'mm',
    humidity: '%',
    distance: 'km',
  },
  pm25: {
    bands: { ok: 15, watch: 37.5, warn: 75 },
    pushAt: 37.5,
  },
  quake: {
    tiers: [
      { severity: 'danger', minMagnitude: 7.0, maxDistanceKm: 1500 },
      { severity: 'warn', minMagnitude: 6.0, maxDistanceKm: 1500 },
    ],
    lookbackHours: 24 * 7,
    duplicateWithinSeconds: 90,
    duplicateWithinKm: 50,
  },
  flood: {
    bmaSubStatus: { 2: 'watch', 3: 'warn' },
    dangerDepthCm: 30,
  },
  waterLevel: {
    watchPct: 80,
    warnPct: 100,
    dangerPct: 120,
  },
  rain: {
    watchMmPerHour: 10,
    warnMmPerHour: 35,
    dangerMmPerHour: 60,
  },
  zones: {
    kinds: ['flood', 'pm25', 'rain', 'waterlevel'],
    aggregate: 'worst',
  },
  push: {
    kinds: ['flood', 'rain', 'water', 'pm25', 'quake'],
    cooldownHours: 3,
    maxPerRun: 500,
    ttlSeconds: 3600,
    quakeChoices: { minMagnitude: [5, 6, 7], maxDistanceKm: [500, 1000, 1500] },
  },
  staleAfterMinutes: 90,
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Deep-merges overrides into the defaults. Arrays (e.g. quake tiers) are replaced, not merged. */
export function mergeConfig(override: DeepPartial<AlertConfig> = {}, base: AlertConfig = DEFAULT_CONFIG): AlertConfig {
  const out = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const current = out[key];
    out[key] =
      value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object'
        ? mergeConfig(value as never, current as never)
        : value;
  }
  return out as unknown as AlertConfig;
}
