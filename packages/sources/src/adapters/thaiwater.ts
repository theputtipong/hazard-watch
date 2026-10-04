import { regionProvinces, regionRadars, waterLevelSeverity, type Observation, type RadarFrame } from '@hw/core';
import { getJson, settle, type AdapterContext } from '../http';

// api-v3.thaiwater.net rate-limits cloud IPs (HTTP 429), so this also runs from GitHub Actions.
const BASE = 'https://api-v3.thaiwater.net/api/v1/thaiwater30';
const WATERLEVEL_URL = `${BASE}/public/waterlevel_load`;
const MAIN_URL = `${BASE}/public/thailand_main`;
const IMAGE_URL = `${BASE}/shared/image?image=`;


interface WaterLevelRow {
  id: number;
  waterlevel_datetime: string;
  waterlevel_msl: string | null;
  storage_percent: string | null;
  situation_level: number | null;
  station: { id: number; tele_station_name: { th: string; en?: string }; tele_station_lat: number; tele_station_long: number };
  geocode: { province_name: { th: string; en: string }; amphoe_name: { th: string; en: string } };
}

export function parseWaterLevel(body: { waterlevel_data: { data: WaterLevelRow[] } }, ctx: AdapterContext): Observation[] {
  const provinces = regionProvinces(ctx.regions);
  return body.waterlevel_data.data
    .filter((r) => provinces.has(r.geocode.province_name.th))
    .map((r) => {
      const pct = r.storage_percent === null ? null : Number(r.storage_percent);
      return {
        id: `thaiwater:${r.station.id}`,
        kind: 'waterlevel',
        source: 'thaiwater',
        name: { th: r.station.tele_station_name.th, en: r.station.tele_station_name.en || r.station.tele_station_name.th },
        location: { lat: r.station.tele_station_lat, lng: r.station.tele_station_long },
        observedAt: new Date(`${r.waterlevel_datetime.replace(' ', 'T')}:00+07:00`).toISOString(),
        value: pct,
        unit: '% bank-full',
        severity: pct === null ? 'ok' : waterLevelSeverity(pct, ctx.config),
        offline: pct === null,
        extra: { msl: r.waterlevel_msl === null ? null : Number(r.waterlevel_msl), province: r.geocode.province_name.th, amphoe: r.geocode.amphoe_name.th },
      } satisfies Observation;
    });
}

interface RadarRow {
  radar_type: string;
  agency: string;
  media_datetime: string;
  media_path: string;
}

/** ThaiWater labels times "UTC"/"TST" inconsistently; in practice every value is UTC. */
export function parseRadars(body: { radar: { data: { data: RadarRow[] } } }, ctx: AdapterContext): RadarFrame[] {
  const radars = regionRadars(ctx.regions);
  return body.radar.data.data
    .filter((r) => radars.includes(r.radar_type) && r.media_path && r.media_datetime)
    .map((r) => ({
      radarId: r.radar_type,
      source: 'thaiwater',
      time: new Date(`${r.media_datetime.replace(' ', 'T')}:00Z`).toISOString(),
      imageUrl: IMAGE_URL + encodeURIComponent(r.media_path),
    }));
}

export const thaiwaterLevels = (ctx: AdapterContext) =>
  settle('thaiwater', ctx, async () => parseWaterLevel(await getJson(ctx, WATERLEVEL_URL), ctx));

export const thaiwaterRadars = (ctx: AdapterContext) =>
  settle('thaiwater', ctx, async () => parseRadars(await getJson(ctx, MAIN_URL), ctx));
