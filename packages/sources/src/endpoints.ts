/**
 * Every external URL and request setting in one place. If a source moves or changes its address,
 * edit it here only. Notes on each source's quirks are in TODO.md ("ข้อมูลอ้างอิง").
 */
export const ENDPOINTS = {
  air4thai: 'https://air4thai.pcd.go.th/services/getNewAQI_JSON.php',
  /** Unofficial; POST only; blocks cloud IPs (403). */
  bmaFlood: 'https://weather.bangkok.go.th/Flood/PageMap/GetDataTable',
  bmaRain: 'https://weather.bangkok.go.th/rain/PageMap/GetDataForUpdate',
  bmaTraffic: 'http://www.bmatraffic.com/',
  bmaTrafficView: (id: string) => `http://www.bmatraffic.com/PlayVideo.aspx?ID=${id}`,
  /** Feed size: 4.5_day, 4.5_week, 2.5_week, significant_month ... see USGS docs. */
  usgs: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson',
  tmdQuakeRss: 'https://earthquake.tmd.go.th/feed/rss_tmd.xml',
  /** Rate-limits cloud IPs (429) except GitHub runners. */
  thaiwaterBase: 'https://api-v3.thaiwater.net/api/v1/thaiwater30',
  openMeteo: 'https://api.open-meteo.com/v1/forecast',
} as const;

export const REQUEST = {
  userAgent: 'hazard-watch/0.1 (public non-commercial dashboard)',
  timeoutMs: 30_000,
  /** Timezone the Thai feeds use for local timestamps without an offset. */
  thaiOffset: '+07:00',
  /** Open-Meteo coordinates are rounded to this many decimals (~1 km) so responses cache well. */
  weatherCoordDecimals: 2,
} as const;
