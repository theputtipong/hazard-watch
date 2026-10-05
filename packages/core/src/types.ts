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

/** One normalized reading from any source, e.g. a PM2.5 station or a flood sensor. */
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
  /** Sensor reported a fault; value should not be trusted. */
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
}

export interface CctvCamera {
  id: string;
  source: SourceId;
  name: LocalizedText;
  location: LatLng;
  /** Page at the source where the live view can be watched. */
  viewUrl: string;
  /**
   * Page that must be opened first so the source creates a session (BMA Traffic shows a blank camera page
   * otherwise). The app opens this, then moves the same tab to `viewUrl`.
   */
  sessionUrl?: string;
}

export interface RadarFrame {
  radarId: string;
  source: SourceId;
  time: string;
  imageUrl: string;
  /** Number of rain-echo pixels found when the frame was processed (0 = no rain in range). */
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

/** Result of one adapter run, stored by the ingest worker. */
export interface SourceResult<T> {
  source: SourceId;
  fetchedAt: string;
  ok: boolean;
  error?: string;
  items: T[];
}

export interface GroupSnapshot<F> {
  updatedAt: string;
  feeds: F;
}

/** Shape returned by the ingest worker's GET /v1/snapshot. */
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
