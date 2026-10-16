import type { LatLng, NasaEvent, NasaEventCategory } from '@hw/core';
import { ENDPOINTS } from '../endpoints';
import { getText, settle, type AdapterContext } from '../http';

/** The filtered open list is ~50 events; the cap only guards against a sudden flood of entries. */
export const EVENT_CAP = 100;
/** Storm tracks can hold hundreds of 6-hourly fixes; the newest 40 (~10 days) are enough to draw the path. */
export const TRACK_CAP = 40;

const CATEGORIES: readonly NasaEventCategory[] = ['severeStorms', 'volcanoes', 'floods', 'landslides'];

interface EonetGeometry {
  date?: string;
  type?: string;
  coordinates?: unknown;
  magnitudeValue?: number | null;
  magnitudeUnit?: string | null;
}

interface EonetEvent {
  id?: string;
  title?: string;
  categories?: { id?: string }[];
  sources?: { url?: string }[];
  geometry?: EonetGeometry[];
}

/** Collects [lng, lat] pairs from Point / Polygon / MultiPolygon coordinate nests. */
function pairs(c: unknown, out: LatLng[] = []): LatLng[] {
  if (!Array.isArray(c)) return out;
  if (c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') {
    const [lng, lat] = c as [number, number];
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) out.push({ lat, lng });
    return out;
  }
  for (const inner of c) pairs(inner, out);
  return out;
}

/** A polygon becomes the plain average of its vertices: good enough to place one marker and measure distance. */
function point(g: EonetGeometry): LatLng | null {
  const ps = pairs(g.coordinates);
  if (!ps.length) return null;
  if (ps.length === 1) return ps[0]!;
  const sum = ps.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: Math.round((sum.lat / ps.length) * 1e4) / 1e4, lng: Math.round((sum.lng / ps.length) * 1e4) / 1e4 };
}

function httpsUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/** EONET labels its JSON `application/rss+xml`, so callers pass the raw text (or an already parsed object). */
export function parseEonet(body: unknown): NasaEvent[] {
  let doc = body;
  if (typeof body === 'string') {
    try {
      doc = JSON.parse(body);
    } catch {
      throw new Error(`EONET: non-JSON response: ${body.slice(0, 80)}`);
    }
  }
  const events = (doc as { events?: unknown })?.events;
  if (!Array.isArray(events)) throw new Error('EONET: no events array');

  const out: NasaEvent[] = [];
  for (const e of events as EonetEvent[]) {
    const category = e.categories?.map((c) => c.id).find((id): id is NasaEventCategory => CATEGORIES.includes(id as NasaEventCategory));
    if (!category || typeof e.id !== 'string' || typeof e.title !== 'string') continue;
    const fixes = (e.geometry ?? [])
      .map((g) => ({ g, at: typeof g.date === 'string' ? Date.parse(g.date) : Number.NaN, location: point(g) }))
      .filter((x): x is { g: EonetGeometry; at: number; location: LatLng } => Number.isFinite(x.at) && x.location !== null)
      .sort((a, b) => a.at - b.at);
    const latest = fixes.at(-1);
    if (!latest) continue;
    const track =
      category === 'severeStorms'
        ? fixes.slice(-TRACK_CAP).map(({ g, at, location }) => ({
            at: new Date(at).toISOString(),
            location,
            windKts: g.magnitudeUnit === 'kts' && typeof g.magnitudeValue === 'number' && Number.isFinite(g.magnitudeValue) ? g.magnitudeValue : null,
          }))
        : [];
    out.push({
      id: e.id,
      category,
      title: e.title.trim().slice(0, 200),
      location: latest.location,
      track,
      updatedAt: new Date(latest.at).toISOString(),
      url: httpsUrl(e.sources?.[0]?.url),
    });
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, EVENT_CAP);
}

export const eonetEvents = (ctx: AdapterContext) =>
  settle('nasa-eonet', ctx, async () => parseEonet(await getText(ctx, ENDPOINTS.eonet)));
