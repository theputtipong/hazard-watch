/** Ordered from least to most severe. */
export const SEVERITIES = ['ok', 'watch', 'warn', 'danger'] as const;
export type Severity = (typeof SEVERITIES)[number];

export type HazardKind = 'weather' | 'rain' | 'flood' | 'waterlevel' | 'pm25' | 'quake';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface LocalizedText {
  th: string;
  en: string;
}

export interface Observation {
  id: string;
  kind: HazardKind;
  source: SourceId;
  name: LocalizedText;
  location: LatLng;
  /** ISO 8601 with offset. */
  observedAt: string;
  value: number | null;
  unit: string;
  severity: Severity;
  offline?: boolean;
  extra?: Record<string, string | number | boolean | null>;
}

export interface Earthquake {
  id: string;
  source: SourceId;
  magnitude: number;
  depthKm: number | null;
  location: LatLng;
  place: LocalizedText;
  occurredAt: string;
  url?: string;
}

export interface WeatherNow {
  source: SourceId;
  location: LatLng;
  observedAt: string;
  temperatureC: number | null;
  humidityPct: number | null;
  precipitationMm: number | null;
  weatherCode: number | null;
  /** 10 m wind; direction is where it comes FROM, clockwise from north. Missing in older cached responses. */
  windSpeedKmh?: number | null;
  windFromDeg?: number | null;
  windGustKmh?: number | null;
  /** 700 hPa (~3 km) wind steers most rain cells: a rough guide to radar echo drift. */
  cloudWindSpeedKmh?: number | null;
  cloudWindFromDeg?: number | null;
}

export interface CctvCamera {
  id: string;
  source: SourceId;
  name: LocalizedText;
  location: LatLng;
  viewUrl: string;
  /** Opened first in the same tab so BMA Traffic creates a session; otherwise `viewUrl` shows a blank page. */
  sessionUrl?: string;
}

export interface RadarFrame {
  radarId: string;
  source: SourceId;
  time: string;
  imageUrl: string;
  echoPixels?: number;
}

export type SourceId =
  | 'open-meteo'
  | 'tmd'
  | 'air4thai'
  | 'gistda'
  | 'usgs'
  | 'bma-flood'
  | 'bma-rain'
  | 'bma-traffic'
  | 'thaiwater';

export interface SourceResult<T> {
  source: SourceId;
  fetchedAt: string;
  ok: boolean;
  error?: string;
  items: T[];
  /** Set by the ingest store; kept across failures. */
  lastOkAt?: string;
  /** Set by the ingest store while `ok` is false: start of the current failure streak. */
  failingSince?: string;
}

export interface GroupSnapshot<F> {
  updatedAt: string;
  feeds: F;
}

export interface DashboardSnapshot {
  edge: GroupSnapshot<{
    pm25?: SourceResult<Observation>;
    quakesUsgs?: SourceResult<Earthquake>;
    quakesTmd?: SourceResult<Earthquake>;
  }> | null;
  runner: GroupSnapshot<{
    flood?: SourceResult<Observation>;
    rain?: SourceResult<Observation>;
    waterlevel?: SourceResult<Observation>;
    radar?: SourceResult<RadarFrame>;
    cctv?: SourceResult<CctvCamera>;
  }> | null;
}
