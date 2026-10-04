/**
 * Every alert threshold lives here so it can be tuned without touching logic.
 * Values are defaults; deployments may override them (see mergeConfig).
 */
export interface AlertConfig {
  pm25: {
    /** Upper bound (µg/m³, 24h avg) of each display band, using WHO 2021 guideline + interim targets. */
    bands: { ok: number; watch: number; warn: number };
    /** Push notification fires at or above this value. Default = Thai national standard. */
    pushAt: number;
  };
  quake: {
    minMagnitude: number;
    radiusKm: number;
    /** At or above this magnitude inside the radius the event is treated as danger. */
    dangerMagnitude: number;
    /** How far back the dashboard looks, in hours. */
    lookbackHours: number;
  };
  flood: {
    /** Water depth (cm) at a BMA point considered dangerous for cars/pedestrians. */
    dangerDepthCm: number;
  };
  waterLevel: {
    /** Percent of bank-full at a river/canal gauge (ThaiWater storage_percent). */
    watchPct: number;
    warnPct: number;
    dangerPct: number;
  };
  rain: {
    /** mm in the past hour. */
    watchMmPerHour: number;
    warnMmPerHour: number;
    dangerMmPerHour: number;
  };
  /** Readings older than this are shown as stale and ignored for alerts. */
  staleAfterMinutes: number;
}

export const DEFAULT_CONFIG: AlertConfig = {
  pm25: {
    bands: { ok: 15, watch: 37.5, warn: 75 },
    pushAt: 37.5,
  },
  quake: {
    minMagnitude: 6.0,
    radiusKm: 1500,
    dangerMagnitude: 7.0,
    lookbackHours: 24 * 7,
  },
  flood: {
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
  staleAfterMinutes: 90,
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export function mergeConfig(override: DeepPartial<AlertConfig> = {}, base: AlertConfig = DEFAULT_CONFIG): AlertConfig {
  const out = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const current = out[key];
    out[key] =
      value && typeof value === 'object' && current && typeof current === 'object'
        ? mergeConfig(value as never, current as never)
        : value;
  }
  return out as unknown as AlertConfig;
}
