import {
  damSeverity,
  inRegions,
  RADARS,
  regionProvinces,
  waterLevelSeverity,
  type DamExtra,
  type Observation,
  type RadarFrame,
} from '@hw/core';
import { ENDPOINTS, REQUEST } from '../endpoints';
import { getJson, settle, type AdapterContext } from '../http';

// api-v3.thaiwater.net rate-limits cloud IPs (HTTP 429), so this also runs from GitHub Actions.
const BASE = ENDPOINTS.thaiwaterBase;
const WATERLEVEL_URL = `${BASE}/public/waterlevel_load`;
const MAIN_URL = `${BASE}/public/thailand_main`;
const IMAGE_URL = `${BASE}/shared/image?image=`;
const DAM_URL = `${BASE}/analyst/dam`;

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
        observedAt: new Date(`${r.waterlevel_datetime.replace(' ', 'T')}:00${REQUEST.thaiOffset}`).toISOString(),
        value: pct,
        unit: ctx.config.units.waterLevel,
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

/** All calibrated radars, regardless of region. ThaiWater labels times "UTC"/"TST" inconsistently; they are UTC. */
export function parseRadars(body: { radar: { data: { data: RadarRow[] } } }): RadarFrame[] {
  return body.radar.data.data
    .filter((r) => r.radar_type in RADARS && r.media_path && r.media_datetime)
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
  settle('thaiwater', ctx, async () => parseRadars(await getJson(ctx, MAIN_URL)));

type Num = number | string | null | undefined;

interface DamRow {
  id: number;
  /** "YYYY-MM-DD", an ICT calendar date (daily report, no time). */
  dam_date: string | null;
  dam_storage: Num;
  /** % of normal storage (รนก.). */
  dam_storage_percent: Num;
  /** Large dams only: usable water as % of normal storage, ThaiWater's `rule_web` low-water input. */
  dam_uses_water_percent?: Num;
  dam_uses_water: Num;
  dam_inflow: Num;
  dam_released: Num;
  dam: {
    id: number;
    dam_name: { th: string; en?: string };
    dam_lat: Num;
    dam_long: Num;
    normal_storage?: Num;
  };
  agency: { id: number; agency_name?: { th?: string; en?: string } } | null;
  basin?: { basin_name?: { th?: string; en?: string } } | null;
  geocode?: { province_name?: { th?: string; en?: string } } | null;
}

export interface ThaiwaterDamBody {
  data: { dam_daily?: DamRow[]; dam_medium?: DamRow[] };
}

/** ThaiWater agency id of the Royal Irrigation Department (กรมชลประทาน). */
const RID_AGENCY = 12;
/** Same window as thaiwater.net's medium-dam page: older rows are leftovers (some dated 1970-01-01). */
const MEDIUM_MAX_AGE_DAYS = 2;
const DAY_MS = 86_400_000;

const num = (v: Num): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Whole ICT calendar days from `date` ("YYYY-MM-DD") to `now`; null when the date is unusable. */
function ageDays(date: string | null, now: Date): number | null {
  const m = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const todayIct = new Date(now.getTime() + 7 * 3_600_000);
  const today = Date.UTC(todayIct.getUTCFullYear(), todayIct.getUTCMonth(), todayIct.getUTCDate());
  return Math.round((today - Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) / DAY_MS);
}

function damObservation(r: DamRow, size: DamExtra['size'], ctx: AdapterContext, provinces: Set<string>): Observation | null {
  const pct = num(r.dam_storage_percent);
  const storage = num(r.dam_storage);
  const lat = num(r.dam.dam_lat);
  const lng = num(r.dam.dam_long);
  if (pct === null || storage === null || lat === null || lng === null || (lat === 0 && lng === 0) || !r.dam_date) return null;
  const location = { lat, lng };
  const province = r.geocode?.province_name?.th?.trim() ?? '';
  // Province names like the water level parser; coordinates only when the row has no province.
  if (province ? !provinces.has(province) : !inRegions(location, ctx.regions)) return null;
  const normal = num(r.dam.normal_storage);
  // Some medium reservoirs have normal_storage 0; their % is still given, so derive the capacity from it.
  const capacity = normal !== null && normal > 0 ? normal : pct > 0 ? Math.round((storage * 10_000) / pct) / 100 : null;
  const usable = num(r.dam_uses_water);
  // Large rows carry ThaiWater's own usable %; for medium rows apply the same formula (usable / normal storage).
  const usablePct =
    size === 'large'
      ? num(r.dam_uses_water_percent)
      : usable !== null && normal !== null && normal > 0
        ? Math.round((usable * 10_000) / normal) / 100
        : null;
  const th = r.dam.dam_name.th.trim();
  const en = size === 'large' ? r.dam.dam_name.en?.trim() || th : th;
  const extra: DamExtra = {
    storageMcm: storage,
    capacityMcm: capacity,
    usablePct,
    inflowMcm: num(r.dam_inflow),
    releaseMcm: num(r.dam_released),
    size,
    basin: r.basin?.basin_name?.th?.trim() || null,
    province,
    agency: r.agency?.agency_name?.th?.trim() || 'กรมชลประทาน',
  };
  return {
    // `dam_daily` and `dam_medium` number their dams separately (live: 12 ids shared by a large and a medium dam),
    // so the size is part of the id: `thaiwater-dam:large:<id>` / `thaiwater-dam:medium:<id>`. Same namespace as
    // one feed, and the tag is `DamExtra.size`, so neither size gets a bare id that looks like the "real" one.
    id: `thaiwater-dam:${size}:${r.dam.id}`,
    kind: 'dam',
    source: 'thaiwater',
    name: { th, en },
    location,
    observedAt: new Date(`${r.dam_date}T00:00:00${REQUEST.thaiOffset}`).toISOString(),
    value: pct,
    unit: ctx.config.units.dam,
    severity: damSeverity(pct, usablePct, ctx.config),
    extra,
  } satisfies Observation;
}

/**
 * RID dams from `analyst/dam`: the 35 large dams (`dam_daily`, EGAT rows skipped: they duplicate RID dams under
 * other ids with storage % mostly 0) and current RID medium reservoirs (`dam_medium`, ≤2 ICT days old).
 * Large dams first, then by capacity, largest first.
 */
export function parseThaiwaterDams(body: ThaiwaterDamBody, ctx: AdapterContext): Observation[] {
  const provinces = regionProvinces(ctx.regions);
  const rid = (r: DamRow) => r.agency?.id === RID_AGENCY;
  const large = (body.data.dam_daily ?? []).filter(rid).map((r) => damObservation(r, 'large', ctx, provinces));
  const medium = (body.data.dam_medium ?? [])
    .filter((r) => {
      const age = ageDays(r.dam_date, ctx.now);
      return rid(r) && age !== null && age >= 0 && age <= MEDIUM_MAX_AGE_DAYS;
    })
    .map((r) => damObservation(r, 'medium', ctx, provinces));
  const cap = (o: Observation) => (o.extra as DamExtra).capacityMcm ?? 0;
  const byCapacity = (a: Observation, b: Observation) => cap(b) - cap(a);
  const keep = (list: (Observation | null)[]) => list.filter((o): o is Observation => o !== null).sort(byCapacity);
  return [...keep(large), ...keep(medium)];
}

export const thaiwaterDams = (ctx: AdapterContext) =>
  settle('thaiwater', ctx, async () => parseThaiwaterDams(await getJson(ctx, DAM_URL), ctx));
