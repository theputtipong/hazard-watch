import {
  DEFAULT_CONFIG,
  DEFAULT_VIEW,
  distanceKm,
  isStale,
  quakeAlertFloor,
  quakeSeverity,
  regionFor,
  type AlertConfig,
  type Earthquake,
  type LocalizedText,
  type Observation,
  type Severity,
} from '@hw/core';
import type { GroupSnapshot } from './store';

export interface SummaryReading {
  value: number;
  severity: Severity;
  name: LocalizedText;
}

export interface Summary {
  updatedAt: string | null;
  region: LocalizedText;
  pm25: { worst: SummaryReading; stations: number } | null;
  /** Gauge values are % of bank-full. */
  water: { worst: SummaryReading; stations: number; alerts: number } | null;
  quake: { magnitude: number; place: LocalizedText; occurredAt: string; distanceKm: number; severity: Severity } | null;
  feeds: { ok: number; total: number };
}

const QUAKE_WINDOW_HOURS = 24;

function liveReadings(items: unknown[] | undefined, cfg: AlertConfig, now: Date): Observation[] {
  return ((items ?? []) as Observation[]).filter((o) => o.value !== null && !o.offline && !isStale(o.observedAt, cfg, now));
}

function worstReading(list: Observation[]): SummaryReading | null {
  const top = list.reduce<Observation | null>((best, o) => (best && best.value! >= o.value! ? best : o), null);
  return top ? { value: top.value!, severity: top.severity, name: top.name } : null;
}

export function buildSummary(edge: GroupSnapshot | null, runner: GroupSnapshot | null, now = new Date(), cfg = DEFAULT_CONFIG): Summary {
  const region = regionFor(null);
  // The region is now all of Thailand and its centre sits ~100 km from Bangkok, which would skew every quake
  // distance; measure from the default view (Bangkok), the area this summary speaks for.
  const from = DEFAULT_VIEW.center;
  const feeds = { ...edge?.feeds, ...runner?.feeds };

  const pm25 = liveReadings(feeds.pm25?.items, cfg, now);
  const pm25Worst = worstReading(pm25);

  const water = liveReadings(feeds.waterlevel?.items, cfg, now);
  const waterWorst = worstReading(water);

  const since = now.getTime() - QUAKE_WINDOW_HOURS * 3_600_000;
  const { maxDistanceKm } = quakeAlertFloor(cfg);
  const quake = ([...(feeds.quakesTmd?.items ?? []), ...(feeds.quakesUsgs?.items ?? [])] as Earthquake[])
    .filter((q) => new Date(q.occurredAt).getTime() >= since && distanceKm(from, q.location) <= maxDistanceKm)
    // TMD first, so on equal magnitude its Thai place name wins over USGS.
    .reduce<Earthquake | null>((best, q) => (best && best.magnitude >= q.magnitude ? best : q), null);

  const results = Object.values(feeds);
  const times = [edge?.updatedAt, runner?.updatedAt].filter((t): t is string => !!t).sort();

  return {
    updatedAt: times.at(-1) ?? null,
    region: region.name,
    pm25: pm25Worst ? { worst: pm25Worst, stations: pm25.length } : null,
    water: waterWorst
      ? { worst: waterWorst, stations: water.length, alerts: water.filter((o) => o.severity === 'warn' || o.severity === 'danger').length }
      : null,
    quake: quake
      ? {
          magnitude: quake.magnitude,
          place: quake.place,
          occurredAt: quake.occurredAt,
          distanceKm: Math.round(distanceKm(from, quake.location)),
          severity: quakeSeverity(quake, from, cfg),
        }
      : null,
    feeds: { ok: results.filter((r) => r?.ok).length, total: results.length },
  };
}
