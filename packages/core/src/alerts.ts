import type { AlertConfig, PushKind } from './config';
import { distanceKm } from './geo';
import { t, type Lang } from './i18n';
import { quakePlace } from './quakePlace';
import { isStale, quakeSeverity, rank } from './severity';
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

const both = (key: Parameters<typeof t>[0], vars: Record<string, string | number>) => ({
  th: t(key, 'th', vars),
  en: t(key, 'en', vars),
});

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
        title: { th: t(title, 'th', { ...vars, area: area('th') }), en: t(title, 'en', { ...vars, area: area('en') }) },
        body: both(body, vars),
      });
    };

    const flooded = inside.filter((o) => o.kind === 'flood' && rank(o.severity) >= rank('warn'));
    if (flooded.length) {
      const deepest = Math.max(...flooded.map((o) => o.value ?? 0));
      const sev = flooded.some((o) => o.severity === 'danger') ? 'danger' : 'warn';
      make('flood', sev, 'alert.flood.title', 'alert.flood.body', { n: flooded.length, depth: Math.round(deepest) });
    }

    const rain = inside.filter((o) => o.kind === 'rain' && (o.value ?? 0) >= cfg.rain.warnMmPerHour);
    if (rain.length) {
      const top = rain.reduce((a, b) => ((a.value ?? 0) >= (b.value ?? 0) ? a : b));
      make('rain', top.severity, 'alert.rain.title', 'alert.rain.body', { v: top.value ?? 0 });
    }

    const water = inside.filter((o) => o.kind === 'waterlevel' && (o.value ?? 0) >= cfg.waterLevel.warnPct);
    if (water.length) {
      const top = water.reduce((a, b) => ((a.value ?? 0) >= (b.value ?? 0) ? a : b));
      list.push({
        key: `water:${id}`,
        kind: 'water',
        severity: top.severity,
        zoneId: id,
        title: { th: t('alert.water.title', 'th', { area: area('th') }), en: t('alert.water.title', 'en', { area: area('en') }) },
        body: {
          th: t('alert.water.body', 'th', { station: top.name.th, v: Math.round(top.value ?? 0) }),
          en: t('alert.water.body', 'en', { station: top.name.en, v: Math.round(top.value ?? 0) }),
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

/** Earthquake alerts for a district, measured from the district's centre. */
export function quakeAlerts(quakes: Earthquake[], district: ZoneFeature, cfg: AlertConfig, now: Date = new Date()): Alert[] {
  const centre = zoneCenter(district);
  const since = now.getTime() - cfg.quake.lookbackHours * 3_600_000;
  return quakes
    .filter((q) => new Date(q.occurredAt).getTime() >= since)
    .map((q) => ({ q, severity: quakeSeverity(q, centre, cfg), km: Math.round(distanceKm(centre, q.location)) }))
    .filter((x) => x.severity !== 'ok')
    .map(({ q, severity, km }) => ({
      key: `quake:${q.id}`,
      kind: 'quake' as const,
      severity,
      zoneId: null,
      title: both('alert.quake.title', { mag: q.magnitude.toFixed(1) }),
      body: { th: t('alert.quake.body', 'th', { place: quakePlace(q, 'th'), km }), en: t('alert.quake.body', 'en', { place: q.place.en, km }) },
    }));
}
