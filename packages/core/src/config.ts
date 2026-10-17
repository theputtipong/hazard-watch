import type { HazardKind, Severity } from './types';

/** Read by both the ingest worker and the web app: redeploy both after editing. */
export interface AlertConfig {
  units: {
    pm25: string;
    rain: string;
    floodDepth: string;
    waterLevel: string;
    temperature: string;
    precipitation: string;
    humidity: string;
    distance: string;
    windSpeed: string;
    dam: string;
  };
  pm25: {
    /** WHO 2021 guideline + interim targets. */
    bands: { ok: number; watch: number; warn: number };
    /** Thai national 24 h standard. */
    pushAt: number;
  };
  quake: {
    /** Most severe matching tier wins; no match = 'ok'. */
    tiers: { severity: Exclude<Severity, 'ok'>; minMagnitude: number; maxDistanceKm: number }[];
    lookbackHours: number;
    /** USGS and TMD often report the same event: reports this close in time and space are one. */
    duplicateWithinSeconds: number;
    duplicateWithinKm: number;
  };
  flood: {
    /** BMA `flood_sub_status` → severity; unlisted codes (1 normal, 0/5 offline) are 'ok'. */
    bmaSubStatus: Record<number, Severity>;
    dangerDepthCm: number;
  };
  waterLevel: {
    /** ThaiWater storage_percent: 70 = "น้ำมาก", 100 = "ล้นตลิ่ง"; 120 is our own. */
    watchPct: number;
    warnPct: number;
    dangerPct: number;
  };
  rain: {
    /** No official Thai hourly scale: 10 = WMO/JMA "heavy", 30 = JMA "very heavy", 60 = BMA drains overwhelmed. */
    watchMmPerHour: number;
    warnMmPerHour: number;
    dangerMmPerHour: number;
    /** TMD 24 h classes: heavy from 35.1, very heavy from 90.1; 60 sits between. */
    watch24hMm: number;
    warn24hMm: number;
    danger24hMm: number;
  };
  /**
   * Dam storage bands from ThaiWater's own `dam.setting.scale` (% of normal storage, รนก.):
   * >overPct เกินความจุ · >highPct–overPct น้ำมาก · >lowPct–highPct ปกติ · >criticalPct–lowPct น้ำน้อย ·
   * usable water (% ใช้การได้) ≤ criticalUsablePct น้ำน้อยวิกฤต. Display-only: dams are never pushed or zoned.
   */
  dam: {
    /** Above this storage % = 'over' (เกินความจุ), severity 'danger'. */
    overPct: number;
    /** Above this storage % = 'high' (น้ำมาก), severity 'watch'. */
    highPct: number;
    /** Above this storage % = 'normal' (ปกติ). */
    lowPct: number;
    /** Above this storage % = 'low' (น้ำน้อย); at or below, with no usable % known, 'critical'. */
    criticalPct: number;
    /** Usable water at or below this % = 'critical' (น้ำน้อยวิกฤต), ThaiWater `rule_web`. */
    criticalUsablePct: number;
  };
  zones: {
    /** Earthquakes are regional, so they are not zoned. */
    kinds: HazardKind[];
    aggregate: 'worst';
  };
  push: {
    kinds: PushKind[];
    cooldownHours: number;
    /** Most push-service requests one run makes, whatever the plan; also capped by `maxSubrequests`. */
    maxPerRun: number;
    /**
     * Outgoing fetches one Worker invocation may make, counting the cron's own feed and GitHub fetches.
     * Workers Free allows 50 (Paid 10,000); kept under it because a fetch past the cap throws.
     */
    maxSubrequests: number;
    ttlSeconds: number;
    /** The only values the server accepts for a personal quake limit. */
    quakeChoices: { minMagnitude: number[]; maxDistanceKm: number[] };
  };
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
    windSpeed: 'km/h',
    dam: '%',
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
    watchPct: 70,
    warnPct: 100,
    dangerPct: 120,
  },
  rain: {
    watchMmPerHour: 10,
    warnMmPerHour: 30,
    dangerMmPerHour: 60,
    watch24hMm: 35.1,
    warn24hMm: 60,
    danger24hMm: 90.1,
  },
  dam: {
    overPct: 100,
    highPct: 80,
    lowPct: 50,
    criticalPct: 30,
    criticalUsablePct: 30,
  },
  zones: {
    kinds: ['flood', 'pm25', 'rain', 'waterlevel'],
    aggregate: 'worst',
  },
  push: {
    kinds: ['flood', 'rain', 'water', 'pm25', 'quake'],
    cooldownHours: 3,
    maxPerRun: 500,
    maxSubrequests: 40,
    ttlSeconds: 3600,
    quakeChoices: { minMagnitude: [5, 6, 7], maxDistanceKm: [500, 1000, 1500] },
  },
  staleAfterMinutes: 90,
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Arrays (e.g. quake tiers) are replaced, not merged. */
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
