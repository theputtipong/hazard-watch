import {
  DEFAULT_CONFIG,
  districtAlerts,
  distanceKm,
  feedStatuses,
  inZone,
  isStale,
  mergeQuakes,
  nasaNear,
  quakeAlertFloor,
  quakeAlerts,
  quakePlace,
  quakeSeverity,
  rank,
  worst,
  zoneCenter,
  type AlertConfig,
  type DashboardSnapshot,
  type FeedStatus,
  type HazardKind,
  type LatLng,
  type LocalizedText,
  type NasaNear,
  type Observation,
  type PushKind,
  type Severity,
  type ZoneFeature,
} from '@hw/core';
// names.json is already in the bundle for push ids, so province names cost nothing extra (provinces.json is ~240 KB).
import namesFile from '../../web/public/geo/names.json';
import { DISTRICTS, districtAt, findDistrict } from './geo';

export { districtAt, findDistrict };

/**
 * Severities and alert text use the same rules as Web Push so every channel agrees; text the app can build from a
 * level (notes, gauge states, times) is left to the app's strings.
 */
export interface AreaReport {
  generatedAt: string;
  updatedAt: string | null;
  district: AreaDistrict;
  /** The district's level: worst of its alerts, the same rules as Web Push. */
  severity: Severity;
  /**
   * No alerts and nothing shown at caution or above: the calm "all normal" message may show. A nearby gauge outside
   * the district can be high without being this district's alert, so this is not the same as severity 'ok'.
   */
  calm: boolean;
  /** Heaviest first. Titles follow "<level>: <what> in <where>". */
  alerts: AreaAlert[];
  readings: { pm25: AreaReading | null; rain: AreaReading | null };
  /** Street-flood sensors inside the district; null when the district has none. */
  flood: { flooded: number; minor: number; normal: number; offline: number; deepestCm: number | null } | null;
  /** Nearest canal/river gauges, % of bank-full. */
  rivers: AreaReading[];
  /** Latest earthquake in range of the district, even if it is not an alert. */
  quake: { magnitude: number; place: LocalizedText; occurredAt: string; km: number; severity: Severity } | null;
  /** NASA fires/events near the district centre, display only (never an alert); null when neither feed exists. */
  nasa: NasaNear | null;
  feeds: FeedStatus[];
}

export interface AreaDistrict {
  id: string;
  name: LocalizedText;
  province: LocalizedText | null;
  center: LatLng;
}

export interface AreaAlert {
  key: string;
  kind: PushKind;
  severity: Severity;
  title: LocalizedText;
  body: LocalizedText;
}

export interface AreaReading {
  id: string;
  kind: HazardKind;
  source: Observation['source'];
  name: LocalizedText;
  value: number;
  unit: string;
  severity: Severity;
  observedAt: string;
  km: number;
  /** Older than the stale limit: show "—" and the time of the last reading, never as current. */
  stale: boolean;
}

const RIVER_COUNT = 3;

// Province ids are 4 chars (TH + 2 digits); names.json maps id → [th, en].
const PROVINCES = new Map(
  Object.entries(namesFile as unknown as Record<string, [string, string]>)
    .filter(([id]) => id.length === 4)
    .map(([id, [th, en]]) => [id, { th, en }]),
);

export const districtInfo = (d: ZoneFeature): AreaDistrict => ({
  id: d.properties.id,
  name: { th: d.properties.name_th, en: d.properties.name_en },
  province: d.properties.parent ? (PROVINCES.get(d.properties.parent) ?? null) : null,
  center: zoneCenter(d),
});

/** Every district the app can follow, grouped by province then name (Thai order). */
export function districtList(): AreaDistrict[] {
  return DISTRICTS.map(districtInfo).sort(
    (a, b) => (a.province?.th ?? '').localeCompare(b.province?.th ?? '', 'th') || a.name.th.localeCompare(b.name.th, 'th'),
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function reading(o: Observation, from: LatLng, cfg: AlertConfig, now: Date): AreaReading {
  return {
    id: o.id,
    kind: o.kind,
    source: o.source,
    name: o.name,
    value: o.value!,
    unit: o.unit,
    severity: o.severity,
    observedAt: o.observedAt,
    km: round1(distanceKm(from, o.location)),
    stale: isStale(o.observedAt, cfg, now),
  };
}

/** Nearest working sensors, fresh ones first: a stale reading only shows when nothing fresh exists. */
function nearest(items: Observation[], from: LatLng, cfg: AlertConfig, now: Date, limit: number): AreaReading[] {
  const usable = items.filter((o) => !o.offline && o.value !== null).map((o) => reading(o, from, cfg, now));
  const fresh = usable.filter((r) => !r.stale);
  return (fresh.length ? fresh : usable).sort((a, b) => a.km - b.km).slice(0, limit);
}

/** Same 0.1 km precision as the other distances in the report; full floats only bloat the payload. */
const nasaReport = (n: NasaNear): NasaNear => ({
  fires: { ...n.fires, nearestKm: n.fires.nearestKm === null ? null : round1(n.fires.nearestKm) },
  events: n.events.map((e) => ({ ...e, km: round1(e.km) })),
});

export function buildAreaReport(snapshot: DashboardSnapshot, district: ZoneFeature, now = new Date(), cfg = DEFAULT_CONFIG): AreaReport {
  const info = districtInfo(district);
  const runner = snapshot.runner?.feeds;
  const edge = snapshot.edge?.feeds;
  const flood = runner?.flood?.items ?? [];
  const rain = runner?.rain?.items ?? [];
  const water = runner?.waterlevel?.items ?? [];
  const pm25 = edge?.pm25?.items ?? [];
  const fires = runner?.fires;
  const events = runner?.events;

  const quakes = mergeQuakes(edge?.quakesTmd?.items ?? [], edge?.quakesUsgs?.items ?? [], cfg);
  const alerts: AreaAlert[] = [
    ...(districtAlerts([...flood, ...rain, ...water, ...pm25], [district], cfg, now).get(info.id) ?? []),
    ...quakeAlerts(quakes, district, cfg, now),
  ]
    .sort((a, b) => rank(b.severity) - rank(a.severity))
    .map(({ key, kind, severity, title, body }) => ({ key, kind, severity, title, body }));

  const readings = {
    pm25: nearest(pm25, info.center, cfg, now, 1)[0] ?? null,
    rain: nearest(rain, info.center, cfg, now, 1)[0] ?? null,
  };
  const rivers = nearest(water, info.center, cfg, now, RIVER_COUNT);

  const inside = flood.filter((o) => inZone(district, o.location) && !isStale(o.observedAt, cfg, now));
  const floodCounts = inside.length
    ? {
        flooded: inside.filter((o) => !o.offline && rank(o.severity) >= rank('warn')).length,
        minor: inside.filter((o) => !o.offline && o.severity === 'watch').length,
        normal: inside.filter((o) => !o.offline && o.severity === 'ok').length,
        offline: inside.filter((o) => o.offline).length,
        deepestCm: inside.reduce<number | null>((m, o) => (!o.offline && o.value !== null && o.value > (m ?? 0) ? o.value : m), null),
      }
    : null;

  const since = now.getTime() - cfg.quake.lookbackHours * 3_600_000;
  const regional = quakes.find(
    (q) => Date.parse(q.occurredAt) >= since && distanceKm(info.center, q.location) <= quakeAlertFloor(cfg).maxDistanceKm,
  );

  const shown = [readings.pm25, readings.rain, ...rivers].filter((r): r is AreaReading => !!r && !r.stale);
  const times = [snapshot.edge?.updatedAt, snapshot.runner?.updatedAt].filter((t): t is string => !!t).sort();

  return {
    generatedAt: now.toISOString(),
    updatedAt: times.at(-1) ?? null,
    district: info,
    severity: worst(alerts.map((a) => a.severity)),
    calm: !alerts.length && shown.every((r) => rank(r.severity) < rank('watch')),
    alerts,
    readings,
    flood: floodCounts,
    rivers,
    quake: regional
      ? {
          magnitude: regional.magnitude,
          // Thai names for USGS places, as on the web.
          place: { th: quakePlace(regional, 'th'), en: quakePlace(regional, 'en') },
          occurredAt: regional.occurredAt,
          km: Math.round(distanceKm(info.center, regional.location)),
          severity: quakeSeverity(regional, info.center, cfg),
        }
      : null,
    nasa: fires || events ? nasaReport(nasaNear(fires?.items ?? [], events?.items ?? [], info.center, now)) : null,
    feeds: feedStatuses(snapshot, now),
  };
}
