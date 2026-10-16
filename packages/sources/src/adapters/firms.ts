import { FIRE_BOUNDS, type FireHotspot, type SourceResult } from '@hw/core';
import { ENDPOINTS, FIRMS_SATS } from '../endpoints';
import { getText, type AdapterContext } from '../http';

/** Burning season (Feb–Apr) can bring thousands of rows a day; the snapshot and every client stay bounded. */
export const FIRE_CAP = 3_000;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** VIIRS sends low/nominal/high (older files l/n/h); MODIS sends 0–100. */
function confidence(raw: string): FireHotspot['confidence'] {
  const n = Number(raw);
  if (raw !== '' && Number.isFinite(n)) return n < 30 ? 'low' : n < 80 ? 'nominal' : 'high';
  const c = raw.trim().toLowerCase()[0];
  return c === 'l' ? 'low' : c === 'h' ? 'high' : 'nominal';
}

/**
 * Parses a FIRMS CSV by header name (VIIRS and MODIS differ in brightness/confidence columns) and keeps rows inside
 * FIRE_BOUNDS. A hand-rolled split is enough: FIRMS fields never contain commas or quotes.
 */
export function parseFirmsCsv(csv: string, sat: FireHotspot['satellite']): FireHotspot[] {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/);
  const header = (lines[0] ?? '').split(',').map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const [iLat, iLng, iDate, iTime, iConf, iFrp, iDn] = ['latitude', 'longitude', 'acq_date', 'acq_time', 'confidence', 'frp', 'daynight'].map(col);
  if ([iLat, iLng, iDate, iTime].some((i) => i! < 0)) throw new Error(`FIRMS ${sat}: unexpected CSV header`);

  const out: FireHotspot[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line) continue;
    const f = line.split(',');
    const lat = Number(f[iLat!]);
    const lng = Number(f[iLng!]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < FIRE_BOUNDS.minLat || lat > FIRE_BOUNDS.maxLat || lng < FIRE_BOUNDS.minLng || lng > FIRE_BOUNDS.maxLng) continue;
    // acq_time is HHMM UTC; some files drop the leading zero ("622").
    const hhmm = (f[iTime!] ?? '').trim().padStart(4, '0');
    const date = (f[iDate!] ?? '').trim();
    const detectedAt = new Date(`${date}T${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}:00Z`);
    if (!/^\d{4}$/.test(hhmm) || Number.isNaN(detectedAt.getTime())) continue;
    const frpRaw = iFrp! >= 0 ? Number(f[iFrp!]) : Number.NaN;
    const location = { lat: round3(lat), lng: round3(lng) };
    out.push({
      id: `${sat}:${location.lat}:${location.lng}:${date}T${hhmm}`,
      location,
      detectedAt: detectedAt.toISOString(),
      frp: Number.isFinite(frpRaw) && frpRaw >= 0 ? frpRaw : null,
      confidence: confidence(iConf! >= 0 ? (f[iConf!] ?? '') : ''),
      satellite: sat,
      day: iDn! >= 0 ? (f[iDn!] ?? '').trim().toUpperCase() !== 'N' : true,
    });
  }
  return out;
}

/** Dedupes by id, keeps the strongest fires first (newest on ties) and caps the list. */
export function rankFires(fires: FireHotspot[], cap = FIRE_CAP): FireHotspot[] {
  const byId = new Map<string, FireHotspot>();
  for (const f of fires) if (!byId.has(f.id)) byId.set(f.id, f);
  return [...byId.values()]
    .sort((a, b) => (b.frp ?? -1) - (a.frp ?? -1) || b.detectedAt.localeCompare(a.detectedAt))
    .slice(0, cap);
}

/** One satellite file failing (e.g. N21 late) still leaves a useful map, so the feed is ok while any file loaded. */
export async function firmsFires(ctx: AdapterContext): Promise<SourceResult<FireHotspot>> {
  const fetchedAt = ctx.now.toISOString();
  const runs = await Promise.allSettled(
    FIRMS_SATS.map(async ({ dir, prefix, sat }) => parseFirmsCsv(await getText(ctx, ENDPOINTS.firms(dir, prefix)), sat)),
  );
  const errors = runs.flatMap((r, i) => (r.status === 'rejected' ? [`${FIRMS_SATS[i]!.sat}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`] : []));
  const loaded = runs.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (!loaded.length) return { source: 'nasa-firms', fetchedAt, ok: false, error: errors.join('; '), items: [] };
  const out: SourceResult<FireHotspot> = { source: 'nasa-firms', fetchedAt, ok: true, items: rankFires(loaded.flat()) };
  if (errors.length) out.error = errors.join('; ');
  return out;
}
