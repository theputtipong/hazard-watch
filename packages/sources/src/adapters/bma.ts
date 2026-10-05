import { bmaFloodSeverity, rainSeverity, type Observation } from '@hw/core';
import { ENDPOINTS } from '../endpoints';
import { getJson, settle, type AdapterContext } from '../http';
import { aspNetDate } from '../time';

// Unofficial endpoints used by weather.bangkok.go.th. They only answer POST and block cloud IPs,
// so these adapters run from the GitHub Actions ingest job, not the Cloudflare worker.
const POST = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' };

interface FloodPoint {
  flood_id: number;
  flood_code: string;
  flood_name: string;
  flood_name_en: string;
  flood: number | null;
  status: number;
  flood_sub_status: number;
  latitude: number;
  longitude: number;
  site_timestamp: string | null;
  districtName: string | null;
  /** Underpasses report inbound/outbound separately under the same id. */
  tunnel_sub_name: string | null;
  tunnel_sub_name_en: string | null;
}

interface RainGauge {
  rain_id: number;
  rain_code: string;
  rain_name: string;
  rain_name_en: string;
  latitude: number;
  longitude: number;
  site_timestamp: string | null;
  rf1hr: number | null;
  rf24hr: number | null;
  status: number;
  district_name: string | null;
}

export function parseBmaFlood(points: FloodPoint[], ctx: AdapterContext): Observation[] {
  return uniqueIds(points
    .filter((p) => p.latitude && p.longitude)
    .map((p) => {
      const offline = p.status === 0;
      const sub = (s: string | null) => (s?.trim() ? ` (${s.trim()})` : '');
      return {
        id: `bma-flood:${p.flood_id}${p.tunnel_sub_name_en?.trim() ? `:${p.tunnel_sub_name_en.trim()}` : ''}`,
        kind: 'flood',
        source: 'bma-flood',
        name: { th: p.flood_name.trim() + sub(p.tunnel_sub_name), en: p.flood_name_en.trim() + sub(p.tunnel_sub_name_en) },
        location: { lat: p.latitude, lng: p.longitude },
        observedAt: aspNetDate(p.site_timestamp) ?? ctx.now.toISOString(),
        value: offline ? null : (p.flood ?? null),
        unit: ctx.config.units.floodDepth,
        severity: offline ? 'ok' : bmaFloodSeverity(p.flood_sub_status, p.flood, ctx.config),
        offline,
        extra: { subStatus: p.flood_sub_status, district: p.districtName },
      } satisfies Observation;
    }));
}

/** A few BMA points share an id with no other distinguishing field; suffix repeats so ids stay unique. */
function uniqueIds<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, number>();
  return items.map((it) => {
    const n = seen.get(it.id) ?? 0;
    seen.set(it.id, n + 1);
    return n ? { ...it, id: `${it.id}#${n}` } : it;
  });
}

export function parseBmaRain(gauges: RainGauge[], ctx: AdapterContext): Observation[] {
  return gauges.map((g) => {
    const offline = g.status === 0;
    return {
      id: `bma-rain:${g.rain_code}`,
      kind: 'rain',
      source: 'bma-rain',
      name: { th: g.rain_name.trim(), en: g.rain_name_en.trim() },
      location: { lat: g.latitude, lng: g.longitude },
      observedAt: aspNetDate(g.site_timestamp) ?? ctx.now.toISOString(),
      value: offline ? null : g.rf1hr,
      unit: ctx.config.units.rain,
      severity: offline || g.rf1hr === null ? 'ok' : rainSeverity(g.rf1hr, ctx.config, g.rf24hr),
      offline,
      extra: { rain24h: g.rf24hr, district: g.district_name },
    } satisfies Observation;
  });
}

export const bmaFlood = (ctx: AdapterContext) =>
  settle('bma-flood', ctx, async () => parseBmaFlood(await getJson(ctx, ENDPOINTS.bmaFlood, POST), ctx));

export const bmaRain = (ctx: AdapterContext) =>
  settle('bma-rain', ctx, async () => parseBmaRain(await getJson(ctx, ENDPOINTS.bmaRain, POST), ctx));
