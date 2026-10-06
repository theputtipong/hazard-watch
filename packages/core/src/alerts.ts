import type { AlertConfig, PushKind } from './config';
import { distanceKm } from './geo';
import { t, type Lang } from './i18n';
import { quakePlace } from './quakePlace';
import { isStale, quakeAlertFloor, quakeSeverity, rank } from './severity';
import type { Earthquake, Observation, Severity } from './types';
import { groupByZone, zoneCenter, type ZoneFeature } from './zones';

/** One thing worth telling people in an area about. */
export interface Alert {
  /** Stable for the same hazard in the same area, so repeats can be suppressed. */
  key: string;
  kind: PushKind;
  severity: Severity;
  /** Zone the alert is about (district id), or null for region-wide (earthquakes). */
  zoneId: string | null;
  title: Record<Lang, string>;
  body: Record<Lang, string>;
  /** The reading behind the alert (e.g. PM2.5 value), so per-user thresholds can be applied at send time. */
  value?: number;
}

/** Level word that opens every alert title ("ระวังมาก: …"), per the design system's alert format. */
const level = (s: Severity, lang: Lang) => t(`severity.${s}`, lang);

const zoneName = (z: ZoneFeature) => ({ th: z.properties.name_th, en: z.properties.name_en });

/**
 * Alerts per district from current readings. Only readings newer than `staleAfterMinutes` count,
 * and each hazard uses the thresholds in AlertConfig (so tuning config.ts tunes the pushes too).
 */
export function districtAlerts(
  readings: Observation[],
  districts: ZoneFeature[],
  cfg: AlertConfig,
  now: Date = new Date(),
): Map<string, Alert[]> {
  const fresh = readings.filter((o) => !o.offline && o.value !== null && !isStale(o.observedAt, cfg, now));
  const groups = groupByZone(fresh, districts);
  const out = new Map<string, Alert[]>();

  for (const d of districts) {
    const id = d.properties.id;
    const inside = groups.get(id) ?? [];
    const name = zoneName(d);
    const list: Alert[] = [];
    const area = (lang: Lang) => name[lang];
    const make = (kind: PushKind, severity: Severity, title: Parameters<typeof t>[0], body: Parameters<typeof t>[0], vars: Record<string, string | number>, value?: number) => {
      list.push({
        value,
        key: `${kind}:${id}`,
        kind,
        severity,
        zoneId: id,
        title: {
          th: t(title, 'th', { ...vars, area: area('th'), level: level(severity, 'th') }),
          en: t(title, 'en', { ...vars, area: area('en'), level: level(severity, 'en') }),
        },
        body: {
          th: t(body, 'th', { ...vars, note: t(`note.pm25.${severity}`, 'th') }),
          en: t(body, 'en', { ...vars, note: t(`note.pm25.${severity}`, 'en') }),
        },
      });
    };

    const flooded = inside.filter((o) => o.kind === 'flood' && rank(o.severity) >= rank('warn'));
    if (flooded.length) {
      const deepest = Math.max(...flooded.map((o) => o.value ?? 0));
      const sev = flooded.some((o) => o.severity === 'danger') ? 'danger' : 'warn';
      make('flood', sev, 'alert.flood.title', 'alert.flood.body', { n: flooded.length, depth: Math.round(deepest) });
    }

    // Severity already folds in the 24 h total (rainSeverity), so a long steady rain alerts too.
    const rain = inside.filter((o) => o.kind === 'rain' && rank(o.severity) >= rank('warn'));
    if (rain.length) {
      const top = rain.reduce((a, b) => (rank(a.severity) > rank(b.severity) || (a.severity === b.severity && (a.value ?? 0) >= (b.value ?? 0)) ? a : b));
      const day = typeof top.extra?.rain24h === 'number' ? top.extra.rain24h : null;
      if (day !== null && (top.value ?? 0) < cfg.rain.warnMmPerHour) make('rain', top.severity, 'alert.rain.title', 'alert.rain.body24h', { v: day });
      else make('rain', top.severity, 'alert.rain.title', 'alert.rain.body', { v: top.value ?? 0 });
    }

    const water = inside.filter((o) => o.kind === 'waterlevel' && (o.value ?? 0) >= cfg.waterLevel.warnPct);
    if (water.length) {
      const top = water.reduce((a, b) => ((a.value ?? 0) >= (b.value ?? 0) ? a : b));
      list.push({
        key: `water:${id}`,
        kind: 'water',
        severity: top.severity,
        zoneId: id,
        title: {
          th: t('alert.water.title', 'th', { area: area('th'), level: level(top.severity, 'th') }),
          en: t('alert.water.title', 'en', { area: area('en'), level: level(top.severity, 'en') }),
        },
        body: {
          th: t('alert.water.body', 'th', { station: top.name.th, v: Math.round(top.value ?? 0), state: t(`gauge.state.${top.severity}`, 'th') }),
          en: t('alert.water.body', 'en', { station: top.name.en, v: Math.round(top.value ?? 0), state: t(`gauge.state.${top.severity}`, 'en') }),
        },
      });
    }

    // PM2.5: built from the lowest band so each person's own threshold (default pm25.pushAt) can filter it.
    const pm = inside.filter((o) => o.kind === 'pm25' && (o.value ?? 0) > cfg.pm25.bands.ok);
    if (pm.length) {
      const top = pm.reduce((a, b) => ((a.value ?? 0) >= (b.value ?? 0) ? a : b));
      make('pm25', top.severity, 'alert.pm25.title', 'alert.pm25.body', { v: top.value ?? 0 }, top.value ?? 0);
    }

    out.set(id, list);
  }
  return out;
}

/** USGS and TMD often report the same event; keep one (preferring TMD, which has Thai text). Window is in config. */
export function mergeQuakes(tmd: Earthquake[], usgs: Earthquake[], cfg: AlertConfig): Earthquake[] {
  const { duplicateWithinSeconds, duplicateWithinKm } = cfg.quake;
  const out = [...tmd];
  for (const q of usgs) {
    const dup = tmd.some(
      (x) =>
        Math.abs(new Date(x.occurredAt).getTime() - new Date(q.occurredAt).getTime()) < duplicateWithinSeconds * 1000 &&
        distanceKm(x.location, q.location) < duplicateWithinKm,
    );
    if (!dup) out.push(q);
  }
  return out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/** Smallest magnitude and widest distance (from the person's district) that raise a quake alert. */
export interface QuakeLimit {
  minMagnitude: number;
  maxDistanceKm: number;
}

/** A person's own quake choice; null/undefined (or a value not in the allowed choices) = the central quake tiers. */
export interface QuakePref {
  minMagnitude?: number | null;
  maxDistanceKm?: number | null;
}

/** Returns `value` when it is one of `choices`, otherwise null (= use the central default). */
export function pickChoice(value: unknown, choices: readonly number[]): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) && choices.includes(n) ? n : null;
}

/** The limit a person's quake alerts use: their own choice where valid, otherwise the central quake tiers. */
export function personalQuakeLimit(cfg: AlertConfig, pref: QuakePref = {}): QuakeLimit {
  const floor = quakeAlertFloor(cfg);
  return {
    minMagnitude: pickChoice(pref.minMagnitude, cfg.push.quakeChoices.minMagnitude) ?? floor.minMagnitude,
    maxDistanceKm: pickChoice(pref.maxDistanceKm, cfg.push.quakeChoices.maxDistanceKm) ?? floor.maxDistanceKm,
  };
}

/** The widest limit anyone can have (central default included): a quake inside it may concern someone. */
export function loosestQuakeLimit(cfg: AlertConfig): QuakeLimit {
  const floor = quakeAlertFloor(cfg);
  const { minMagnitude, maxDistanceKm } = cfg.push.quakeChoices;
  return {
    minMagnitude: Math.min(floor.minMagnitude, ...minMagnitude),
    maxDistanceKm: Math.max(floor.maxDistanceKm, ...maxDistanceKm),
  };
}

/**
 * Earthquake alerts for a district, measured from the district's centre.
 * Without `limit` an event alerts when it matches a quake tier. With `limit` (a person's own choice) it alerts
 * when magnitude >= limit.minMagnitude and distance <= limit.maxDistanceKm; an event below every tier but
 * inside the personal limit gets severity 'watch'.
 */
export function quakeAlerts(quakes: Earthquake[], district: ZoneFeature, cfg: AlertConfig, now: Date = new Date(), limit?: QuakeLimit): Alert[] {
  const centre = zoneCenter(district);
  const since = now.getTime() - cfg.quake.lookbackHours * 3_600_000;
  return quakes
    .filter((q) => new Date(q.occurredAt).getTime() >= since)
    .map((q) => ({ q, severity: quakeSeverity(q, centre, cfg), dist: distanceKm(centre, q.location) }))
    .filter((x) => (limit ? x.q.magnitude >= limit.minMagnitude && x.dist <= limit.maxDistanceKm : x.severity !== 'ok'))
    .map(({ q, severity, dist }) => {
      const km = Math.round(dist);
      return {
        key: `quake:${q.id}`,
        kind: 'quake' as const,
        severity: severity === 'ok' ? ('watch' as const) : severity,
        zoneId: null,
        title: {
          th: t('alert.quake.title', 'th', { mag: q.magnitude.toFixed(1), level: level(severity === 'ok' ? 'watch' : severity, 'th') }),
          en: t('alert.quake.title', 'en', { mag: q.magnitude.toFixed(1), level: level(severity === 'ok' ? 'watch' : severity, 'en') }),
        },
        body: { th: t('alert.quake.body', 'th', { place: quakePlace(q, 'th'), km }), en: t('alert.quake.body', 'en', { place: q.place.en, km }) },
        value: q.magnitude,
      };
    });
}
