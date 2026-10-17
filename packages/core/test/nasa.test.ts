import { describe, expect, it } from 'vitest';
import {
  feedStatuses,
  FEED_TOPICS,
  gibsTileUrl,
  gibsWmsParams,
  NASA_LAYERS,
  NASA_NEAR,
  NASA_POINT_LAYERS,
  nasaNear,
  SOURCE_META,
  type DashboardSnapshot,
  type FireHotspot,
  type LatLng,
  type NasaEvent,
} from '../src';
import { messages } from '../src/i18n';

const NOW = new Date('2026-10-16T06:00:00Z');
const HOME: LatLng = { lat: 13.75, lng: 100.5 };
// Along a meridian the haversine distance is exact: 1° of latitude = 6371·π/180 km.
const KM_PER_DEG = (6371 * Math.PI) / 180;
const north = (km: number): LatLng => ({ lat: HOME.lat + km / KM_PER_DEG, lng: HOME.lng });

const fire = (km: number, hoursAgo = 1, id = `f${km}`): FireHotspot => ({
  id,
  location: north(km),
  detectedAt: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
  frp: 5,
  confidence: 'nominal',
  satellite: 'N20',
  day: true,
});

const storm = (km: number, id = `EONET_${km}`): NasaEvent => ({
  id,
  category: 'severeStorms',
  title: `Typhoon ${id}`,
  location: north(km),
  track: [
    { at: '2026-10-15T00:00:00Z', location: north(km + 50), windKts: 60 },
    { at: '2026-10-16T00:00:00Z', location: north(km), windKts: 85 },
  ],
  updatedAt: '2026-10-16T00:00:00Z',
  url: 'https://www.nhc.noaa.gov/',
});

describe('nasaNear', () => {
  it('uses the approved radii: fires 25 km, events 500 km', () => {
    expect(NASA_NEAR.fireRadiusKm).toBe(25);
    expect(NASA_NEAR.eventRadiusKm).toBe(500);
  });

  it('counts a fire at 24.9 km but not at 25.1 km', () => {
    const r = nasaNear([fire(24.9), fire(25.1), fire(3)], [], HOME, NOW);
    expect(r.fires.count).toBe(2);
    expect(r.fires.nearestKm).toBeCloseTo(3, 6);
    expect(r.fires.radiusKm).toBe(25);
  });

  it('ignores fires older than 24 h', () => {
    const r = nasaNear([fire(5, 23.9, 'a'), fire(1, 24.1, 'b')], [], HOME, NOW);
    expect(r.fires.count).toBe(1);
    expect(r.fires.nearestKm).toBeCloseTo(5, 6);
  });

  it('reports no fires as count 0 and a null distance', () => {
    expect(nasaNear([fire(30)], [], HOME, NOW).fires).toEqual({ count: 0, nearestKm: null, radiusKm: 25 });
  });

  it('keeps a storm at 499 km and drops one at 501 km', () => {
    const r = nasaNear([], [storm(501), storm(499)], HOME, NOW);
    expect(r.events.map((e) => e.id)).toEqual(['EONET_499']);
    expect(r.events[0]!.km).toBeCloseTo(499, 6);
  });

  it('sorts events nearest first, caps them at 5, and takes wind from the newest track point', () => {
    const r = nasaNear([], [400, 100, 300, 50, 200, 250].map((km) => storm(km)), HOME, NOW);
    expect(r.events.map((e) => Math.round(e.km))).toEqual([50, 100, 200, 250, 300]);
    expect(r.events[0]).toMatchObject({ category: 'severeStorms', windKts: 85, url: 'https://www.nhc.noaa.gov/' });
  });
});

describe('NASA_LAYERS', () => {
  const layers = Object.values(NASA_LAYERS);

  it('keys each layer by its own id, with unique GIBS layers', () => {
    for (const [key, l] of Object.entries(NASA_LAYERS)) expect(l.id).toBe(key);
    expect(new Set(layers.map((l) => l.gibsLayer)).size).toBe(layers.length);
  });

  it('turns on only FIRMS hotspots by default', () => {
    const on = [...layers, ...Object.values(NASA_POINT_LAYERS)].filter((l) => l.defaultOn).map((l) => l.id);
    expect(on).toEqual(['firms']);
  });

  it('caps zoom at the GIBS matrix level and sets an attribution and opacity', () => {
    for (const l of layers) {
      expect(l.maxNativeZoom).toBeGreaterThanOrEqual(6);
      expect(l.maxNativeZoom).toBeLessThanOrEqual(9);
      expect(l.opacity).toBeGreaterThan(0);
      expect(l.opacity).toBeLessThanOrEqual(1);
      expect(l.attribution).toMatch(/NASA/);
    }
  });

  it('builds a WMTS template whose matrix set matches maxNativeZoom', () => {
    expect(gibsTileUrl(NASA_LAYERS.trueColor, NOW)).toBe(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    );
    expect(gibsTileUrl(NASA_LAYERS.imergRain, NOW)).toContain('/IMERG_Precipitation_Rate_30min/default/default/GoogleMapsCompatible_Level6/');
  });

  it('asks WMS for yesterday in UTC', () => {
    const l = NASA_LAYERS.fireWms;
    expect(gibsTileUrl(l, NOW)).toBe('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi');
    // 00:30 Bangkok on the 16th is still the 15th in UTC, so yesterday is the 14th.
    expect(gibsWmsParams(l, new Date('2026-10-15T17:30:00Z'))).toEqual({
      LAYERS: 'VIIRS_NOAA20_Thermal_Anomalies_375m_All',
      FORMAT: 'image/png',
      TRANSPARENT: 'true',
      TIME: '2026-10-14',
    });
  });

  it('has a name in both languages for every layer', () => {
    for (const id of [...Object.keys(NASA_LAYERS), ...Object.keys(NASA_POINT_LAYERS)]) {
      const m = (messages as Record<string, { th: string; en: string }>)[`layer.nasa.${id}`];
      expect(m?.th && m.en, id).toBeTruthy();
    }
  });
});

describe('NASA raster legends', () => {
  const text = messages as Record<string, { th: string; en: string }>;

  it('shows the four official flood classes (MODIS_Flood colormap, No Water left out)', () => {
    expect(NASA_LAYERS.flood.legend?.kind).toBe('classes');
    expect(NASA_LAYERS.flood.legend?.stops.map((s) => s.color)).toEqual(['#32d2f5', '#ffff00', '#fa1e24', '#afafaf']);
  });

  it('gives rain and AOD an ascending ramp, and none to the photo-like layers', () => {
    for (const id of ['imergRain', 'aod'] as const) {
      const l = NASA_LAYERS[id].legend;
      expect(l?.kind, id).toBe('ramp');
      // The leading number on each English label, e.g. '≥50 mm/h' -> 50.
      const values = (l?.stops ?? []).map((s) => Number.parseFloat(text[s.labelKey]!.en.replace('≥', '')));
      expect(values.length, id).toBeGreaterThanOrEqual(5);
      expect(values.every((v, i) => Number.isFinite(v) && (i === 0 || v > values[i - 1]!)), `${id}: ${values.join(',')}`).toBe(true);
    }
    expect(NASA_LAYERS.trueColor.legend).toBeUndefined();
    expect(NASA_LAYERS.fireWms.legend).toBeUndefined();
  });

  it('has colours as #rrggbb and every label and note in Thai and English', () => {
    for (const l of Object.values(NASA_LAYERS)) {
      if (!l.legend) continue;
      for (const key of [...l.legend.stops.map((s) => s.labelKey), l.legend.noteKey]) {
        expect(text[key]?.th && text[key]?.en, key).toBeTruthy();
      }
      for (const s of l.legend.stops) expect(s.color, l.id).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('NASA feeds', () => {
  it('lists fires and events as topics with names and government source links', () => {
    expect(FEED_TOPICS).toContain('fires');
    expect(FEED_TOPICS).toContain('events');
    for (const topic of FEED_TOPICS) expect(messages[`feeds.name.${topic}`]).toBeTruthy();
    for (const id of ['nasa-firms', 'nasa-eonet', 'nasa-gibs'] as const) expect(SOURCE_META[id]).toMatchObject({ id, gov: true });
  });

  it('judges the NASA feeds by the runner age limit', () => {
    const at = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
    const snapshot: DashboardSnapshot = {
      edge: null,
      runner: {
        updatedAt: at(0),
        feeds: {
          fires: { source: 'nasa-firms', fetchedAt: at(300), ok: true, items: [] },
          events: { source: 'nasa-eonet', fetchedAt: at(400), ok: true, items: [] },
        },
      },
    };
    expect(feedStatuses(snapshot, NOW).map((f) => [f.topic, f.state])).toEqual([
      ['fires', 'live'],
      ['events', 'stale'],
    ]);
  });
});
