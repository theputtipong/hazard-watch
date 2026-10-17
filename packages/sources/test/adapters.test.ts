import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  air4thai,
  defaultContext,
  eonetEvents,
  FIRE_CAP,
  firmsFires,
  parseAir4Thai,
  parseBmaFlood,
  parseBmaRain,
  parseBmaTraffic,
  parseEonet,
  parseFirmsCsv,
  parseOpenMeteo,
  parseRadars,
  parseThaiwaterDams,
  parseTmdQuakeRss,
  parseUsgs,
  parseWaterLevel,
  rankFires,
} from '../src';
import { FIRE_BOUNDS, type DamExtra, type FireHotspot } from '@hw/core';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const json = (name: string) => JSON.parse(fixture(name));
const ctx = defaultContext({ now: new Date('2026-10-03T15:00:00Z') });

describe('air4thai', () => {
  const obs = parseAir4Thai(json('air4thai.json'), ctx);
  it('keeps stations nationwide, by coordinates', () => {
    // th-all covers Chiang Mai (35t) too; membership never depends on the areaTH text.
    expect(obs.map((o) => o.id)).toEqual(['air4thai:02t', 'air4thai:03t', 'air4thai:05t', 'air4thai:35t']);
  });
  it('drops stations outside Thailand or with broken coordinates, whatever areaTH says', () => {
    const base = json('air4thai.json').stations[0];
    const stations = [
      { ...base, stationID: 'far', lat: '1.29', long: '103.85' },
      { ...base, stationID: 'blank', lat: '', long: '' },
      { ...base, stationID: 'noArea', areaTH: 'สวนลุมพินี เขตปทุมวัน' },
    ];
    expect(parseAir4Thai({ stations }, ctx).map((o) => o.id)).toEqual(['air4thai:noArea']);
  });
  it('parses value, time and severity', () => {
    const o = obs[0]!;
    expect(o.value).toBe(21.7);
    expect(o.severity).toBe('watch');
    expect(o.observedAt).toBe('2026-10-03T14:00:00.000Z');
  });
  it('marks -1 readings as offline', () => {
    expect(obs[1]).toMatchObject({ value: null, offline: true });
  });
});

describe('bma', () => {
  it('maps flood points', () => {
    const obs = parseBmaFlood(json('bma-flood.json'), ctx);
    expect(obs.map((o) => o.severity)).toEqual(['warn', 'warn', 'watch', 'ok', 'ok', 'ok']);
    expect(obs[5]!.offline).toBe(true);
    expect(obs[0]!.observedAt).toMatch(/^2026-10-03T/);
  });
  it('maps rain gauges', () => {
    const obs = parseBmaRain(json('bma-rain.json'), ctx);
    expect(obs[1]).toMatchObject({ value: 42.5, severity: 'warn', unit: 'mm/h' });
  });
});

describe('quakes', () => {
  it('parses USGS', () => {
    const q = parseUsgs(json('usgs.json'));
    expect(q).toHaveLength(3);
    expect(q[0]!.magnitude).toBeGreaterThanOrEqual(4.5);
  });
  it('parses TMD RSS', () => {
    const q = parseTmdQuakeRss(fixture('tmd-quake.xml'));
    expect(q.length).toBeGreaterThan(3);
    expect(q[0]).toMatchObject({ id: 'tmd:17163', magnitude: 2.1, location: { lat: 18.764, lng: 102.308 }, occurredAt: '2026-10-03T10:59:25.000Z' });
    expect(q[0]!.place.en).toBe('Laos');
  });
});

describe('thaiwater', () => {
  it('keeps water level stations in any Thai province', () => {
    const obs = parseWaterLevel(json('thaiwater-waterlevel.json'), ctx);
    // th-all: Ayutthaya (outside the old Bangkok-metro set) is now kept as well.
    expect(obs).toHaveLength(5);
    expect(obs.every((o) => o.kind === 'waterlevel')).toBe(true);
  });
  it('drops rows whose province is not Thai (ThaiWater lists a Myanmar station)', () => {
    const body = json('thaiwater-waterlevel.json');
    const row = body.waterlevel_data.data[0];
    body.waterlevel_data.data = [row, { ...row, geocode: { ...row.geocode, province_name: { th: 'สาธารณรัฐแห่งสหภาพเมียนมา', en: 'Myanmar' } } }];
    expect(parseWaterLevel(body, ctx)).toHaveLength(1);
  });
  it('keeps calibrated radars, with UTC times', () => {
    const frames = parseRadars(json('thaiwater-main.json'));
    expect(frames.map((f) => f.radarId).sort()).toEqual(['cri240', 'njk', 'nkm', 'svp120']);
    expect(frames.find((f) => f.radarId === 'nkm')!.time).toBe('2026-10-03T14:25:00.000Z');
    expect(frames[0]!.imageUrl).toContain('/shared/image?image=');
  });
});

describe('cctv', () => {
  it('extracts BMA traffic cameras', () => {
    const cams = parseBmaTraffic(fixture('bmatraffic.html'));
    expect(cams.length).toBeGreaterThanOrEqual(3);
    expect(cams[0]).toMatchObject({ id: 'bma-traffic:603', location: { lat: 13.7262, lng: 100.52797 } });
    expect(cams[0]!.viewUrl).toContain('ID=603');
  });
});

describe('open-meteo', () => {
  it('parses current weather', () => {
    const w = parseOpenMeteo(
      { current: { time: '2026-10-03T21:45', temperature_2m: 28.5, relative_humidity_2m: 85, precipitation: 0, weather_code: 3 } },
      { lat: 13.75, lng: 100.5 },
    );
    expect(w).toMatchObject({ temperatureC: 28.5, observedAt: '2026-10-03T14:45:00.000Z', windFromDeg: null });
  });

  it('reads surface and cloud-level wind', () => {
    const w = parseOpenMeteo(
      {
        current: {
          time: '2026-10-06T15:00',
          temperature_2m: 30.2,
          relative_humidity_2m: 70,
          precipitation: 0,
          weather_code: 2,
          wind_speed_10m: 4,
          wind_direction_10m: 39,
          wind_gusts_10m: 19.8,
          wind_speed_700hPa: 11.2,
          wind_direction_700hPa: 87,
        },
      },
      { lat: 13.75, lng: 100.5 },
    );
    expect(w).toMatchObject({ windSpeedKmh: 4, windFromDeg: 39, windGustKmh: 19.8, cloudWindSpeedKmh: 11.2, cloudWindFromDeg: 87 });
  });
});

describe('settle', () => {
  it('turns a failing fetch into ok:false instead of throwing', async () => {
    const failing = defaultContext({ fetch: async () => new Response('blocked', { status: 403 }) });
    const res = await air4thai(failing);
    expect(res).toMatchObject({ ok: false, items: [] });
    expect(res.error).toContain('403');
  });
});

describe('nasa firms', () => {
  const inBounds = (f: FireHotspot) =>
    f.location.lat >= FIRE_BOUNDS.minLat && f.location.lat <= FIRE_BOUNDS.maxLat && f.location.lng >= FIRE_BOUNDS.minLng && f.location.lng <= FIRE_BOUNDS.maxLng;

  it('parses VIIRS rows and keeps only FIRE_BOUNDS', () => {
    const fires = parseFirmsCsv(fixture('firms-viirs-n20.csv'), 'N20');
    // 20 rows inside; Singapore, Kolkata and a malformed line are dropped.
    expect(fires).toHaveLength(20);
    expect(fires.every(inBounds)).toBe(true);
    expect(fires[0]).toEqual({
      id: 'N20:17.181:102.82:2026-10-14T0622',
      location: { lat: 17.181, lng: 102.82 },
      detectedAt: '2026-10-14T06:22:00.000Z',
      frp: 4.09,
      confidence: 'nominal',
      satellite: 'N20',
      day: true,
    });
  });

  it('reads MODIS headers and numeric confidence', () => {
    const fires = parseFirmsCsv(fixture('firms-modis.csv'), 'MODIS');
    expect(fires).toHaveLength(8);
    expect(fires[0]).toMatchObject({ satellite: 'MODIS', confidence: 'nominal', frp: 4.73, detectedAt: '2026-10-15T02:00:00.000Z' });
  });

  it('handles reordered columns, CRLF, a BOM, short acq_time and missing optional columns', () => {
    const csv = '\uFEFFacq_time,longitude,latitude,acq_date,confidence\r\n622,100.5,13.75,2026-10-14,h\r\n5,100.6,13.8,2026-10-14,l\r\n';
    const fires = parseFirmsCsv(csv, 'SNPP');
    expect(fires.map((f) => [f.detectedAt, f.confidence, f.frp, f.day])).toEqual([
      ['2026-10-14T06:22:00.000Z', 'high', null, true],
      ['2026-10-14T00:05:00.000Z', 'low', null, true],
    ]);
  });

  it('rejects a file without the core columns', () => {
    expect(() => parseFirmsCsv('<html>maintenance</html>', 'N20')).toThrow(/header/);
  });

  it('dedupes, ranks by frp then time, and caps', () => {
    const fire = (id: string, frp: number | null, at = '2026-10-14T06:22:00.000Z'): FireHotspot => ({
      id, location: { lat: 13, lng: 100 }, detectedAt: at, frp, confidence: 'nominal', satellite: 'N20', day: true,
    });
    const ranked = rankFires([fire('a', 1), fire('b', 9), fire('a', 1), fire('c', null), fire('d', 9, '2026-10-14T07:00:00.000Z')], 3);
    expect(ranked.map((f) => f.id)).toEqual(['d', 'b', 'a']);
    const many = Array.from({ length: FIRE_CAP + 50 }, (_, i) => fire(`f${i}`, i));
    expect(rankFires(many)).toHaveLength(FIRE_CAP);
  });

  it('stays ok while at least one satellite file loads', async () => {
    const csv = fixture('firms-viirs-n20.csv');
    const fetch = async (url: string) => (url.includes('J1_VIIRS') ? new Response(csv) : new Response('nope', { status: 404 }));
    const res = await firmsFires(defaultContext({ fetch }));
    expect(res).toMatchObject({ source: 'nasa-firms', ok: true });
    expect(res.items).toHaveLength(20);
    expect(res.error).toMatch(/N21: 404.*SNPP: 404/);

    const down = await firmsFires(defaultContext({ fetch: async () => new Response('x', { status: 503 }) }));
    expect(down).toMatchObject({ ok: false, items: [] });
  });
});

describe('nasa eonet', () => {
  it('maps storms with tracks and other events as points', () => {
    const events = parseEonet(json('eonet-open.json'));
    expect(events).toHaveLength(8);
    const trudy = events.find((e) => e.id === 'EONET_25290')!;
    expect(trudy).toMatchObject({
      category: 'severeStorms',
      title: 'Hurricane Trudy',
      location: { lat: 13.5, lng: -101.6 },
      updatedAt: '2026-10-15T18:00:00.000Z',
      url: 'https://www.metoc.navy.mil/jtwc/products/ep2126.tcw',
    });
    expect(trudy.track).toHaveLength(6);
    expect(trudy.track.at(-1)).toEqual({ at: '2026-10-15T18:00:00.000Z', location: { lat: 13.5, lng: -101.6 }, windKts: 80 });
    const volcano = events.find((e) => e.category === 'volcanoes')!;
    expect(volcano.track).toEqual([]);
    // Newest first.
    expect(events.map((e) => e.updatedAt)).toEqual([...events.map((e) => e.updatedAt)].sort().reverse());
  });

  it('turns polygons into a centroid, drops wildfires and non-https links', () => {
    const events = parseEonet({
      events: [
        {
          id: 'EONET_1',
          title: ' Floods, Laos ',
          categories: [{ id: 'floods' }],
          sources: [{ url: 'http://example.org/flood' }],
          geometry: [{ date: '2026-10-10T00:00:00Z', type: 'Polygon', coordinates: [[[102, 17], [104, 17], [104, 19], [102, 19]]] }],
        },
        { id: 'EONET_2', title: 'Wildfire', categories: [{ id: 'wildfires' }], geometry: [{ date: '2026-10-10T00:00:00Z', type: 'Point', coordinates: [100, 15] }] },
        { id: 'EONET_3', title: 'No geometry', categories: [{ id: 'volcanoes' }], geometry: [] },
      ],
    });
    expect(events).toEqual([
      { id: 'EONET_1', category: 'floods', title: 'Floods, Laos', location: { lat: 18, lng: 103 }, track: [], updatedAt: '2026-10-10T00:00:00.000Z', url: null },
    ]);
  });

  it('parses JSON served as application/rss+xml', async () => {
    const body = fixture('eonet-open.json');
    const fetch = async () => new Response(body, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
    const res = await eonetEvents(defaultContext({ fetch }));
    expect(res).toMatchObject({ source: 'nasa-eonet', ok: true });
    expect(res.items).toHaveLength(8);
  });

  it('reports a non-JSON body as a failed feed', async () => {
    const res = await eonetEvents(defaultContext({ fetch: async () => new Response('<rss/>') }));
    expect(res).toMatchObject({ ok: false, items: [] });
    expect(res.error).toContain('non-JSON');
  });
});

describe('thaiwater dams', () => {
  const damCtx = defaultContext({ now: new Date('2026-10-17T07:30:00Z') });
  const body = () => json('thaiwater-dams.json');
  const obs = parseThaiwaterDams(body(), damCtx);
  const extra = (id: string) => obs.find((o) => o.id === id)!.extra as DamExtra;

  it('keeps 6 RID large dams first, then 10 current RID medium reservoirs', () => {
    expect(obs).toHaveLength(16);
    expect(obs.slice(0, 6).every((o) => (o.extra as DamExtra).size === 'large')).toBe(true);
    expect(obs.slice(6).every((o) => (o.extra as DamExtra).size === 'medium')).toBe(true);
    expect(obs.every((o) => o.kind === 'dam' && o.source === 'thaiwater' && o.unit === '%')).toBe(true);
    // Largest capacity first within each group: Ubonrat (2431 MCM), then Lam Pao (1980 MCM).
    expect(obs.slice(0, 2).map((o) => o.name.en)).toEqual(['Ubonrat', 'Lam Pao']);
  });
  it('skips EGAT rows (duplicates of RID dams, storage % 0)', () => {
    const ids = obs.map((o) => o.id);
    for (const id of [46, 49, 45]) expect(ids).not.toContain(`thaiwater-dam:large:${id}`);
    expect(obs.every((o) => (o.extra as DamExtra).agency === 'กรมชลประทาน')).toBe(true);
  });
  it('drops stale medium rows (2026-04-30, 2024, 1970 with no agency) and rows without storage', () => {
    const ids = obs.map((o) => o.id);
    for (const id of [59689, 314, 782]) expect(ids).not.toContain(`thaiwater-dam:medium:${id}`);
    const b = body();
    const row = b.data.dam_medium[0];
    b.data.dam_daily = [];
    b.data.dam_medium = [
      { ...row, dam_date: '2026-10-15' },
      { ...row, dam: { ...row.dam, id: 1 }, dam_date: '2026-10-14' },
      { ...row, dam: { ...row.dam, id: 2 }, agency: { ...row.agency, id: 8 } },
    ];
    expect(parseThaiwaterDams(b, damCtx).map((o) => o.id)).toEqual(['thaiwater-dam:medium:717']);
  });
  it('maps a large dam: value = % of normal storage, extra = DamExtra, ICT date', () => {
    const o = obs.find((x) => x.id === 'thaiwater-dam:large:39')!;
    expect(o).toMatchObject({ name: { th: 'ลำปาว', en: 'Lam Pao' }, value: 60.16, severity: 'ok', location: { lat: 16.60243, lng: 103.4385 } });
    expect(o.observedAt).toBe('2026-10-16T17:00:00.000Z');
    expect(extra('thaiwater-dam:large:39')).toEqual({
      storageMcm: 1191.22,
      capacityMcm: 1980,
      usablePct: 55.11,
      inflowMcm: 1.01,
      releaseMcm: 4.43,
      size: 'large',
      basin: 'ลุ่มน้ำชี',
      province: 'กาฬสินธุ์',
      agency: 'กรมชลประทาน',
    });
  });
  it('maps a medium reservoir: Thai name in both languages, usable % from usable / normal storage', () => {
    const o = obs.find((x) => x.id === 'thaiwater-dam:medium:717')!;
    expect(o.name).toEqual({ th: 'อ่างเก็บน้ำห้วยหินชะแนนใหญ่', en: 'อ่างเก็บน้ำห้วยหินชะแนนใหญ่' });
    expect(extra('thaiwater-dam:medium:717')).toMatchObject({ storageMcm: 9.97, capacityMcm: 12.5, usablePct: 78.4, inflowMcm: null, releaseMcm: null, size: 'medium', province: 'สกลนคร' });
    // normal_storage 0: capacity derived from storage and %, usable % unknown.
    expect(extra('thaiwater-dam:medium:58823')).toMatchObject({ capacityMcm: 1.5, usablePct: null });
  });
  // Live: `dam_daily` and `dam_medium` number dams separately, e.g. 7 is both มูลบน (large) and ห้วยบ้านยาง (medium).
  it('keeps a large and a medium dam that share a ThaiWater id, with distinct ids', () => {
    const b = body();
    const large = b.data.dam_daily[0];
    const medium = b.data.dam_medium[0];
    b.data.dam_daily = [{ ...large, dam: { ...large.dam, id: 7 } }];
    b.data.dam_medium = [{ ...medium, dam: { ...medium.dam, id: 7 } }];
    const out = parseThaiwaterDams(b, damCtx);
    expect(out.map((o) => [o.id, (o.extra as DamExtra).size])).toEqual([
      ['thaiwater-dam:large:7', 'large'],
      ['thaiwater-dam:medium:7', 'medium'],
    ]);
    expect(new Set(obs.map((o) => o.id)).size).toBe(obs.length);
  });
  it('colours by ThaiWater bands: >100 danger, >80 watch, otherwise ok', () => {
    const sev = (id: string) => obs.find((o) => o.id === `thaiwater-dam:${id}`)!.severity;
    expect(sev('medium:336')).toBe('danger'); // 101.7 %
    expect(sev('medium:429')).toBe('watch'); // 89.4 %
    expect(sev('large:4')).toBe('watch'); // Chulaporn 82.74 %
    expect(sev('medium:717')).toBe('ok'); // 79.76 %
    expect(sev('medium:348')).toBe('ok'); // 8.5 %: low water is a label, not an alert colour
  });
  it('drops rows without coordinates or with non-numeric values, and rows outside Thailand', () => {
    const b = body();
    const row = b.data.dam_daily[0];
    b.data.dam_medium = [];
    b.data.dam_daily = [
      row,
      { ...row, dam: { ...row.dam, id: 1, dam_lat: null } },
      { ...row, dam: { ...row.dam, id: 2, dam_lat: 0, dam_long: 0 } },
      { ...row, dam: { ...row.dam, id: 3 }, dam_storage_percent: 'n/a' },
      { ...row, dam: { ...row.dam, id: 4 }, geocode: { ...row.geocode, province_name: { th: 'เวียงจันทน์', en: 'Vientiane' } } },
    ];
    expect(parseThaiwaterDams(b, damCtx).map((o) => o.id)).toEqual(['thaiwater-dam:large:39']);
  });
});
