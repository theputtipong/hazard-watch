/** Ordered from least to most severe. */
export const SEVERITIES = ['ok', 'watch', 'warn', 'danger'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** 'dam' is display-only: never pushed, zoned or used in district alerts. */
export type HazardKind = 'weather' | 'rain' | 'flood' | 'waterlevel' | 'pm25' | 'quake' | 'dam';

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

/** Status label for a dam; see damStatus(). Bands come from ThaiWater's own `dam.setting` scale. */
export const DAM_STATUSES = ['critical', 'low', 'normal', 'high', 'over'] as const;
export type DamStatus = (typeof DAM_STATUSES)[number];

/**
 * `Observation.extra` for kind 'dam' (source 'thaiwater', RID rows of ThaiWater `analyst/dam`).
 * The Observation itself carries: value = storage as % of normal capacity (`dam_storage_percent`, % รนก.),
 * unit = '%', observedAt = `dam_date` (daily, date only, Asia/Bangkok), severity = damSeverity().
 * Volumes are million m³ (MCM, ล้าน ลบ.ม.); flows are MCM per day. Medium reservoirs have a Thai name only
 * (`name.en` repeats the Thai) and often lack inflow/release (null).
 */
export type DamExtra = {
  /** Water stored now, MCM (`dam_storage`). */
  storageMcm: number | null;
  /** Normal storage capacity, MCM (`normal_storage`, รนก.). */
  capacityMcm: number | null;
  /** Usable water as % of normal storage (usable ÷ `normal_storage`, ThaiWater's `dam_uses_water_percent`); drives the 'critical' status. */
  usablePct: number | null;
  /** Inflow, MCM/day (`dam_inflow`). */
  inflowMcm: number | null;
  /** Release, MCM/day (`dam_released`). */
  releaseMcm: number | null;
  /** 'large' = `dam_daily` (35 RID dams), 'medium' = `dam_medium` (current RID rows). */
  size: 'large' | 'medium';
  /** Basin name in Thai, when given. */
  basin?: string | null;
  /** Province name in Thai. */
  province: string;
  /** Data owner as ThaiWater reports it, e.g. 'กรมชลประทาน'. */
  agency: string;
};

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
  | 'thaiwater'
  | 'nasa-firms'
  | 'nasa-eonet'
  | 'nasa-gibs';

/** One FIRMS row, kept compact because the snapshot can hold thousands in the burning season. */
export interface FireHotspot {
  /** `${sat}:${lat}:${lng}:${acqUtc}`: stable across fetches so overlapping files dedupe. */
  id: string;
  /** Rounded to 3 decimals (~100 m), finer than the 375 m pixel is noise. */
  location: LatLng;
  /** ISO UTC from acq_date + acq_time. */
  detectedAt: string;
  /** Fire radiative power, MW. */
  frp: number | null;
  /** MODIS 0–100 is mapped: <30 low, <80 nominal, else high. */
  confidence: 'low' | 'nominal' | 'high';
  satellite: 'N20' | 'N21' | 'SNPP' | 'MODIS';
  day: boolean;
}

export type NasaEventCategory = 'severeStorms' | 'volcanoes' | 'floods' | 'landslides';

/** One open EONET event; wildfires are left out because FIRMS covers them. */
export interface NasaEvent {
  /** EONET id, e.g. EONET_1234. */
  id: string;
  category: NasaEventCategory;
  /** English only from EONET; the UI prefixes a localized category word. */
  title: string;
  /** Latest geometry point (a polygon becomes its centroid). */
  location: LatLng;
  /** Up to 40 newest points, storms only. */
  track: { at: string; location: LatLng; windKts: number | null }[];
  updatedAt: string;
  /** sources[0].url, https only. */
  url: string | null;
}

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
    fires?: SourceResult<FireHotspot>;
    events?: SourceResult<NasaEvent>;
    /** Daily ThaiWater dam storage; display-only. `extra` is a DamExtra. */
    dams?: SourceResult<Observation>;
  }> | null;
}
