import { BMA_URLS } from '@hw/core';

export const ENDPOINTS = {
  air4thai: 'https://air4thai.pcd.go.th/services/getNewAQI_JSON.php',
  /** Unofficial; POST only; blocks cloud IPs (403). */
  bmaFlood: BMA_URLS.flood,
  bmaRain: BMA_URLS.rain,
  bmaTraffic: 'http://www.bmatraffic.com/',
  bmaTrafficView: (id: string) => `http://www.bmatraffic.com/PlayVideo.aspx?ID=${id}`,
  /** Must be opened first to create the ASP.NET session the camera page needs. */
  bmaTrafficSession: 'http://www.bmatraffic.com/index.aspx',
  /** USGS feed sizes: 4.5_day, 4.5_week, 2.5_week, significant_month, ... */
  usgs: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson',
  tmdQuakeRss: 'https://earthquake.tmd.go.th/feed/rss_tmd.xml',
  /** Rate-limits cloud IPs (429) except GitHub runners. */
  thaiwaterBase: 'https://api-v3.thaiwater.net/api/v1/thaiwater30',
  openMeteo: 'https://api.open-meteo.com/v1/forecast',
  /** Keyless FIRMS region files (no CORS, ~1.8 MB each): fetched by the runner, never by browsers or the Worker. */
  firms: (dir: string, prefix: string) => `https://firms.modaps.eosdis.nasa.gov/data/active_fire/${dir}/csv/${prefix}_SouthEast_Asia_24h.csv`,
  /** Without `category` the open list is ~5 MB; wildfires are left out because FIRMS covers them. */
  eonet: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&category=severeStorms,volcanoes,floods,landslides',
} as const;

/** VIIRS only: MODIS adds ~15% coarser (1 km) duplicates of the same fires. */
export const FIRMS_SATS = [
  { dir: 'noaa-20-viirs-c2', prefix: 'J1_VIIRS_C2', sat: 'N20' },
  { dir: 'noaa-21-viirs-c2', prefix: 'J2_VIIRS_C2', sat: 'N21' },
  { dir: 'suomi-npp-viirs-c2', prefix: 'SUOMI_VIIRS_C2', sat: 'SNPP' },
] as const;

export const REQUEST = {
  userAgent: 'hazard-watch/0.1 (public non-commercial dashboard)',
  timeoutMs: 30_000,
  /** Thai feeds send local timestamps without an offset. */
  thaiOffset: '+07:00',
  /** ~1 km, so Open-Meteo responses cache well. */
  weatherCoordDecimals: 2,
} as const;
