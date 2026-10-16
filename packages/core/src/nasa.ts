import { distanceKm } from './geo';
import type { FireHotspot, LatLng, NasaEvent, NasaEventCategory } from './types';

/**
 * What counts as "near" on the area card. Fires are local (smoke, a field burning next door); a storm 500 km away
 * can still reach you within a day. Values approved by the product owner on 2026-10-16.
 */
export const NASA_NEAR = { fireRadiusKm: 25, eventRadiusKm: 500, fireMaxAgeHours: 24, maxEvents: 5 } as const;

/** Box the runner keeps FIRMS rows for: Thailand plus the Myanmar/Laos/Cambodia burning that drives its haze. */
export const FIRE_BOUNDS = { minLat: 4.5, maxLat: 23.5, minLng: 92.0, maxLng: 109.5 } as const;

export interface NasaNear {
  fires: { count: number; nearestKm: number | null; radiusKm: number };
  events: {
    id: string;
    category: NasaEventCategory;
    title: string;
    km: number;
    updatedAt: string;
    windKts: number | null;
    url: string | null;
  }[];
}

/** Fires within the fire radius in the last 24 h, and open events within the event radius (nearest first). */
export function nasaNear(fires: FireHotspot[], events: NasaEvent[], from: LatLng, now = new Date()): NasaNear {
  // Older rows linger in 48 h/7 d files and would make a quiet day look busy.
  const since = now.getTime() - NASA_NEAR.fireMaxAgeHours * 3_600_000;
  let count = 0;
  let nearestKm: number | null = null;
  for (const f of fires) {
    const at = Date.parse(f.detectedAt);
    if (!(at >= since)) continue;
    const km = distanceKm(from, f.location);
    if (km > NASA_NEAR.fireRadiusKm) continue;
    count++;
    if (nearestKm === null || km < nearestKm) nearestKm = km;
  }
  const near = events
    .map((e) => ({ e, km: distanceKm(from, e.location) }))
    .filter(({ km }) => km <= NASA_NEAR.eventRadiusKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, NASA_NEAR.maxEvents)
    .map(({ e, km }) => ({
      id: e.id,
      category: e.category,
      title: e.title,
      km,
      updatedAt: e.updatedAt,
      // Track order isn't part of the contract, so take the wind of the newest point by time.
      windKts: newestTrackPoint(e)?.windKts ?? null,
      url: e.url,
    }));
  return { fires: { count, nearestKm, radiusKm: NASA_NEAR.fireRadiusKm }, events: near };
}

function newestTrackPoint(e: NasaEvent): NasaEvent['track'][number] | undefined {
  let best: NasaEvent['track'][number] | undefined;
  for (const p of e.track) if (!best || p.at > best.at) best = p;
  return best;
}

/** GIBS raster layers. Tiles go straight from the client to NASA, so they cost nothing on our side. */
export type NasaLayerId = 'imergRain' | 'flood' | 'aod' | 'trueColor' | 'fireWms';

export interface NasaLayer {
  id: NasaLayerId;
  gibsLayer: string;
  service: 'wmts' | 'wms';
  format: 'png' | 'jpg';
  /** From the layer's GoogleMapsCompatible_LevelN: GIBS answers 400 above N, so clients must overzoom. */
  maxNativeZoom: number;
  /** 'default' = GIBS picks the latest day; WMS needs an explicit TIME, so the fire layer uses yesterday (UTC). */
  time: 'default' | 'yesterday';
  opacity: number;
  /** Shown on the map; on by default only for FIRMS points (see NASA_POINT_LAYERS). */
  defaultOn: boolean;
  attribution: string;
}

export const GIBS = {
  wmts: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best',
  wms: 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi',
} as const;

export const NASA_ATTRIBUTION = {
  gibs: 'Imagery: NASA EOSDIS GIBS / Worldview',
  firms: 'Fires: NASA FIRMS (LANCE/ESDIS)',
  eonet: 'Events: NASA EONET',
} as const;

// Ids and max zooms checked against live GIBS on 2026-10-16 (research §3). Every raster starts off: GIBS sends
// `cache-control: no-store`, so an always-on layer would refetch tiles on every pan.
export const NASA_LAYERS: Record<NasaLayerId, NasaLayer> = {
  imergRain: {
    id: 'imergRain',
    gibsLayer: 'IMERG_Precipitation_Rate_30min',
    service: 'wmts',
    format: 'png',
    maxNativeZoom: 6,
    time: 'default',
    opacity: 0.7,
    defaultOn: false,
    attribution: `${NASA_ATTRIBUTION.gibs} · IMERG: NASA GPM`,
  },
  flood: {
    id: 'flood',
    gibsLayer: 'VIIRS_Combined_Flood_2-Day',
    service: 'wmts',
    format: 'png',
    maxNativeZoom: 9,
    time: 'default',
    opacity: 0.8,
    defaultOn: false,
    attribution: `${NASA_ATTRIBUTION.gibs} · Flood: NASA LANCE MODIS/VIIRS NRT Global Flood Product`,
  },
  aod: {
    id: 'aod',
    gibsLayer: 'VIIRS_NOAA20_AOD_Deep_Blue_Land_Ocean',
    service: 'wmts',
    format: 'png',
    maxNativeZoom: 6,
    time: 'default',
    opacity: 0.6,
    defaultOn: false,
    attribution: NASA_ATTRIBUTION.gibs,
  },
  trueColor: {
    id: 'trueColor',
    gibsLayer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
    service: 'wmts',
    format: 'jpg',
    maxNativeZoom: 9,
    time: 'default',
    opacity: 1,
    defaultOn: false,
    attribution: NASA_ATTRIBUTION.gibs,
  },
  // The WMTS fire layer is vector-only (404 in tests); the WMS raster works and needs TIME.
  fireWms: {
    id: 'fireWms',
    gibsLayer: 'VIIRS_NOAA20_Thermal_Anomalies_375m_All',
    service: 'wms',
    format: 'png',
    maxNativeZoom: 8,
    time: 'yesterday',
    opacity: 1,
    defaultOn: false,
    attribution: `${NASA_ATTRIBUTION.gibs} · ${NASA_ATTRIBUTION.firms}`,
  },
};

/** Point layers drawn from our own snapshot (not GIBS). FIRMS hotspots are the one NASA layer on by default. */
export type NasaPointLayerId = 'firms' | 'events';
export const NASA_POINT_LAYERS: Record<NasaPointLayerId, { id: NasaPointLayerId; defaultOn: boolean; attribution: string }> = {
  firms: { id: 'firms', defaultOn: true, attribution: NASA_ATTRIBUTION.firms },
  events: { id: 'events', defaultOn: false, attribution: NASA_ATTRIBUTION.eonet },
};

/** GIBS dates daily products by UTC day. */
const utcYesterday = (now: Date) => new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

/** WMTS template with {z}/{y}/{x} for Leaflet/flutter_map; WMS layers get the base URL (pair with gibsWmsParams). */
export function gibsTileUrl(l: NasaLayer, now = new Date()): string {
  if (l.service === 'wms') return GIBS.wms;
  return `${GIBS.wmts}/${l.gibsLayer}/default/${l.time === 'default' ? 'default' : utcYesterday(now)}/GoogleMapsCompatible_Level${l.maxNativeZoom}/{z}/{y}/{x}.${l.format}`;
}

export function gibsWmsParams(l: NasaLayer, now = new Date()): Record<string, string> {
  // WMS has no TIME=default, so any layer asked for over WMS uses yesterday: today's file is still filling.
  return { LAYERS: l.gibsLayer, FORMAT: `image/${l.format === 'jpg' ? 'jpeg' : 'png'}`, TRANSPARENT: 'true', TIME: utcYesterday(now) };
}
