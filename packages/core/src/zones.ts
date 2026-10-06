import type { AlertConfig } from './config';
import { isStale, worst } from './severity';
import type { LatLng, Observation, Severity } from './types';

/** Administrative levels: 1 province (จังหวัด), 2 district (เขต/อำเภอ), 3 subdistrict (แขวง/ตำบล). */
export type ZoneLevel = 1 | 2 | 3;

export interface ZoneProps {
  id: string;
  parent: string | null;
  level: ZoneLevel;
  name_th: string;
  name_en: string;
  /** [minLng, minLat, maxLng, maxLat] */
  bbox: [number, number, number, number];
}

export interface ZoneGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

export interface ZoneFeature {
  type: 'Feature';
  properties: ZoneProps;
  geometry: ZoneGeometry;
}

/** Bounding-box centre: good enough for distances from a hand-picked area. */
export function zoneCenter(zone: ZoneFeature): LatLng {
  const [minLng, minLat, maxLng, maxLat] = zone.properties.bbox;
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
}

export function inZone(zone: ZoneFeature, { lat, lng }: LatLng): boolean {
  const [minLng, minLat, maxLng, maxLat] = zone.properties.bbox;
  if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) return false;
  const polys = (zone.geometry.type === 'Polygon' ? [zone.geometry.coordinates] : zone.geometry.coordinates) as number[][][][];
  return polys.some((rings) => {
    // Even-odd across outer ring and holes.
    let inside = false;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i] as [number, number];
        const [xj, yj] = ring[j] as [number, number];
        if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  });
}

export function groupByZone<T extends { location: LatLng }>(items: T[], zones: ZoneFeature[]): Map<string, T[]> {
  const out = new Map<string, T[]>(zones.map((z) => [z.properties.id, []]));
  for (const item of items) {
    const zone = zones.find((z) => inZone(z, item.location));
    if (zone) out.get(zone.properties.id)!.push(item);
  }
  return out;
}

export interface ZoneSummary {
  /** null must be shown as "no data", never "normal". */
  severity: Severity | null;
  readings: number;
  stale: number;
  flooded: number;
  minorFlood: number;
  pm25Max: number | null;
  rainMax: number | null;
  waterLevelMax: number | null;
}

const maxOf = (values: (number | null)[]) => {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length ? Math.max(...nums) : null;
};

export function summarizeZone(readings: Observation[], cfg: AlertConfig, now: Date = new Date()): ZoneSummary {
  const relevant = readings.filter((o) => !o.offline && o.value !== null && cfg.zones.kinds.includes(o.kind));
  // Old readings must not colour a zone: a flood from yesterday is not a flood now.
  const usable = relevant.filter((o) => !isStale(o.observedAt, cfg, now));
  const of = (kind: Observation['kind']) => usable.filter((o) => o.kind === kind);
  return {
    severity: usable.length ? worst(usable.map((o) => o.severity)) : null,
    readings: usable.length,
    stale: relevant.length - usable.length,
    flooded: of('flood').filter((o) => o.severity === 'warn' || o.severity === 'danger').length,
    minorFlood: of('flood').filter((o) => o.severity === 'watch').length,
    pm25Max: maxOf(of('pm25').map((o) => o.value)),
    rainMax: maxOf(of('rain').map((o) => o.value)),
    waterLevelMax: maxOf(of('waterlevel').map((o) => o.value)),
  };
}

/** Thai administrative terms differ in Bangkok (เขต/แขวง) from other provinces (อำเภอ/ตำบล). */
export const BANGKOK_PCODE = 'TH10';
export const isBangkokZone = (id: string) => id.startsWith(BANGKOK_PCODE);
