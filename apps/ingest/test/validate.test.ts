import { buildZoneIndex, type CctvCamera, type FireHotspot, type NasaEvent, type Observation, type RadarFrame, type ZoneFeature } from '@hw/core';
import { ENDPOINTS } from '@hw/sources';
import { describe, expect, it } from 'vitest';
import type { FeedMap } from '../src/store';
import { parseRunnerPayload, suspiciousJump } from '../src/validate';

const now = new Date('2026-10-05T10:00:00Z');
const fetchedAt = '2026-10-05T09:58:00Z';

const flood = (id: string, over: Partial<Observation> = {}): Observation => ({
  id: `bma-flood:${id}`,
  kind: 'flood',
  source: 'bma-flood',
  name: { th: `จุดวัด ${id}`, en: `Point ${id}` },
  location: { lat: 13.75, lng: 100.5 },
  observedAt: '2026-10-05T09:50:00Z',
  value: 12,
  unit: 'cm',
  severity: 'watch',
  offline: false,
  extra: { subStatus: 2, district: 'พระนคร' },
  ...over,
});

const rain = (id: string, over: Partial<Observation> = {}): Observation => ({
  ...flood(id),
  id: `bma-rain:${id}`,
  kind: 'rain',
  source: 'bma-rain',
  value: 4.5,
  unit: 'mm/h',
  severity: 'ok',
  extra: { rain24h: 20, district: 'บางรัก' },
  ...over,
});

const radar: RadarFrame = {
  radarId: 'nkm',
  source: 'thaiwater',
  time: '2026-10-05T09:45:00.000Z',
  imageUrl: `${ENDPOINTS.thaiwaterBase}/shared/image?image=AAEC`,
  echoPixels: 1200,
};

const camera: CctvCamera = {
  id: 'bma-traffic:603',
  source: 'bma-traffic',
  name: { th: 'แยกสีลม-นราธิวาส', en: 'Silom-Naradhiwas Intersection' },
  location: { lat: 13.7262, lng: 100.52797 },
  viewUrl: ENDPOINTS.bmaTrafficView('603'),
  sessionUrl: ENDPOINTS.bmaTrafficSession,
};

const fire = (id: string, over: Partial<FireHotspot> = {}): FireHotspot => ({
  id: `N20:${id}`,
  location: { lat: 18.79, lng: 98.98 },
  detectedAt: '2026-10-05T06:22:00.000Z',
  frp: 12.5,
  confidence: 'nominal',
  satellite: 'N20',
  day: true,
  ...over,
});

const storm: NasaEvent = {
  id: 'EONET_25290',
  category: 'severeStorms',
  title: 'Typhoon Example',
  location: { lat: 15.2, lng: 125.1 },
  track: [
    { at: '2026-10-04T18:00:00.000Z', location: { lat: 14.8, lng: 127.0 }, windKts: 65 },
    { at: '2026-10-05T00:00:00.000Z', location: { lat: 15.2, lng: 125.1 }, windKts: null },
  ],
  updatedAt: '2026-10-05T00:00:00.000Z',
  url: 'https://www.metoc.navy.mil/jtwc/products/wp2126.tcw',
};

const result = <T>(source: string, items: T[], over: object = {}) => ({ source, fetchedAt, ok: true, items, ...over });

const payload = (feeds: Record<string, unknown>) => ({ feeds });

describe('parseRunnerPayload', () => {
  it('accepts a realistic payload unchanged', () => {
    const out = parseRunnerPayload(
      payload({
        flood: result('bma-flood', [flood('1'), flood('2', { value: null, severity: 'ok', offline: true })]),
        rain: result('bma-rain', [rain('R01')]),
        radar: result('thaiwater', [radar]),
        cctv: result('bma-traffic', [camera]),
      }),
      now,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.dropped).toEqual([]);
    expect(out.feeds.flood!.items).toEqual([flood('1'), flood('2', { value: null, severity: 'ok', offline: true })]);
    expect(out.feeds.cctv!.items).toEqual([camera]);
    expect(out.feeds.radar!.items).toEqual([radar]);
  });

  it('rejects structurally invalid bodies wholesale', () => {
    for (const raw of [null, 'x', [], {}, { feeds: [] }, { feeds: 'x' }]) expect(parseRunnerPayload(raw, now).ok).toBe(false);
    const unknownOnly = parseRunnerPayload(payload({ pm25: result('air4thai', []) }), now);
    expect(unknownOnly).toMatchObject({ ok: false, dropped: [{ feed: 'pm25', reason: 'unknown feed' }] });
  });

  it('drops a bad item but keeps the rest of the feed', () => {
    const items = [flood('1'), flood('2'), flood('3', { location: { lat: 51.5, lng: -0.12 } })];
    const out = parseRunnerPayload(payload({ flood: result('bma-flood', items) }), now);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.feeds.flood!.items).toHaveLength(2);
    expect(out.dropped).toEqual([{ feed: 'flood', id: 'bma-flood:3', reason: expect.stringContaining('location.lat') }]);
  });

  it('drops the whole feed when most items are invalid, so the stored one stays', () => {
    const items = [flood('1'), flood('2', { value: 9999 }), flood('3', { value: Number.NaN })];
    const out = parseRunnerPayload(payload({ flood: result('bma-flood', items), rain: result('bma-rain', [rain('R01')]) }), now);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.feeds.flood).toBeUndefined();
    expect(out.feeds.rain!.items).toHaveLength(1);
    expect(out.dropped.at(-1)).toMatchObject({ feed: 'flood', reason: expect.stringContaining('2/3 items invalid') });
  });

  it.each([
    ['javascript URL', { viewUrl: 'javascript:alert(1)' }],
    ['other http host', { viewUrl: 'http://evil.example/PlayVideo.aspx?ID=1' }],
    ['lookalike host', { sessionUrl: 'http://www.bmatraffic.com.evil.example/' }],
    ['credentials', { viewUrl: 'http://user:pw@www.bmatraffic.com/' }],
    ['data URL', { viewUrl: 'data:text/html,<script>alert(1)</script>' }],
  ])('refuses camera with %s', (_label, over) => {
    const out = parseRunnerPayload(payload({ cctv: result('bma-traffic', [camera, camera, { ...camera, ...over }]) }), now);
    expect(out.ok && out.feeds.cctv!.items).toHaveLength(2);
    expect(out.dropped[0]!.reason).toMatch(/viewUrl|sessionUrl/);
  });

  it('allows BMA Traffic over https too', () => {
    const out = parseRunnerPayload(payload({ cctv: result('bma-traffic', [{ ...camera, viewUrl: 'https://www.bmatraffic.com/PlayVideo.aspx?ID=7' }]) }), now);
    expect(out.ok && out.dropped).toEqual([]);
  });

  it('only allows https radar images from ThaiWater and known radars', () => {
    const bad = [
      { ...radar, imageUrl: 'http://api-v3.thaiwater.net/x.png' },
      { ...radar, imageUrl: 'https://evil.example/x.png' },
      { ...radar, radarId: 'constructor' },
    ];
    const out = parseRunnerPayload(payload({ radar: result('thaiwater', [radar, radar, radar, radar, ...bad]) }), now);
    expect(out.ok && out.feeds.radar!.items).toHaveLength(4);
    expect(out.dropped).toHaveLength(3);
  });

  it('enforces lengths, enums and the source of each feed', () => {
    const bad = [
      flood('a', { name: { th: 'ก'.repeat(201), en: 'x' } }),
      flood('b', { severity: 'apocalypse' as never }),
      flood('c', { source: 'bma-rain' }),
      flood('d', { kind: 'rain' }),
      flood('e', { observedAt: '2027-01-01T00:00:00Z' }),
      flood('f', { extra: { note: { nested: true } as never } }),
    ];
    const good = Array.from({ length: 7 }, (_, i) => flood(`g${i}`));
    const out = parseRunnerPayload(payload({ flood: result('bma-flood', [...good, ...bad]) }), now);
    expect(out.ok && out.feeds.flood!.items).toHaveLength(7);
    expect(out.dropped.map((d) => d.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'].map((s) => `bma-flood:${s}`));

    const wrongSource = parseRunnerPayload(payload({ flood: result('thaiwater', [flood('1')]), rain: result('bma-rain', [rain('R01')]) }), now);
    expect(wrongSource.ok && wrongSource.feeds.flood).toBeUndefined();
  });

  it('strips unknown fields and store-owned timestamps', () => {
    const out = parseRunnerPayload(
      payload({ flood: result('bma-flood', [{ ...flood('1'), html: '<img>' }], { lastOkAt: '2099-01-01T00:00:00Z', error: 'x'.repeat(900), ok: false }) }),
      now,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const feed = out.feeds.flood!;
    expect(feed).not.toHaveProperty('lastOkAt');
    expect(feed.error).toHaveLength(500);
    expect(feed.items[0]).not.toHaveProperty('html');
  });

  it('drops feeds with too many items or a stale fetchedAt', () => {
    const many = Array.from({ length: 101 }, () => radar);
    const out = parseRunnerPayload(
      payload({ radar: result('thaiwater', many), rain: result('bma-rain', [rain('R01')], { fetchedAt: '2026-10-03T00:00:00Z' }), cctv: result('bma-traffic', [camera]) }),
      now,
    );
    expect(out.ok && Object.keys(out.feeds)).toEqual(['cctv']);
    expect(out.dropped.map((d) => d.feed)).toEqual(['radar', 'rain']);
  });
});

describe('parseRunnerPayload: NASA feeds', () => {
  it('accepts fires and events unchanged', () => {
    const volcano: NasaEvent = { ...storm, id: 'EONET_1', category: 'volcanoes', track: [], location: { lat: -36.9, lng: -71.4 }, url: null };
    const out = parseRunnerPayload(
      payload({ fires: result('nasa-firms', [fire('a'), fire('b', { frp: null, day: false })]), events: result('nasa-eonet', [storm, volcano]) }),
      now,
    );
    expect(out.ok && out.dropped).toEqual([]);
    if (!out.ok) return;
    expect(out.feeds.fires!.items).toEqual([fire('a'), fire('b', { frp: null, day: false })]);
    expect(out.feeds.events!.items).toEqual([storm, volcano]);
  });

  it('drops malformed or out-of-bounds fires', () => {
    const bad = [
      fire('x1', { location: { lat: 35.6, lng: 139.7 } }), // Tokyo: outside FIRE_BOUNDS
      fire('x2', { frp: -1 }),
      fire('x3', { confidence: 'certain' as never }),
      fire('x4', { satellite: 'GOES' as never }),
      fire('x5', { detectedAt: '2027-01-01T00:00:00Z' }),
    ];
    const good = Array.from({ length: 6 }, (_, i) => fire(`g${i}`, { location: { lat: 21.9, lng: 96.1 } })); // Mandalay: inside
    const out = parseRunnerPayload(payload({ fires: result('nasa-firms', [...good, { ...fire('g9'), html: '<img>' }, ...bad]) }), now);
    expect(out.ok && out.feeds.fires!.items).toHaveLength(7);
    expect(out.ok && out.feeds.fires!.items[6]).not.toHaveProperty('html');
    expect(out.dropped.map((d) => d.id)).toEqual(['x1', 'x2', 'x3', 'x4', 'x5'].map((s) => `N20:${s}`));
  });

  it('caps fires at 3,000 and events at 100', () => {
    const fires = Array.from({ length: 3001 }, (_, i) => fire(`f${i}`));
    const events = Array.from({ length: 101 }, (_, i) => ({ ...storm, id: `EONET_${i}` }));
    const ok = parseRunnerPayload(payload({ fires: result('nasa-firms', fires.slice(0, 3000)), events: result('nasa-eonet', events.slice(0, 100)) }), now);
    expect(ok.ok && [ok.feeds.fires!.items.length, ok.feeds.events!.items.length]).toEqual([3000, 100]);
    const over = parseRunnerPayload(payload({ fires: result('nasa-firms', fires), events: result('nasa-eonet', events), cctv: result('bma-traffic', [camera]) }), now);
    expect(over.ok && Object.keys(over.feeds)).toEqual(['cctv']);
    expect(over.dropped.map((d) => d.reason)).toEqual(['feed dropped: items: more than 3000', 'feed dropped: items: more than 100']);
  });

  it.each([
    ['http link', { url: 'http://example.org/x' }],
    ['javascript link', { url: 'javascript:alert(1)' }],
    ['unknown category', { category: 'wildfires' }],
    ['bad coordinates', { location: { lat: 95, lng: 0 } }],
    ['bad track point', { track: [{ at: '2026-10-05T00:00:00Z', location: { lat: 0, lng: 0 }, windKts: 9999 }] }],
    ['too long track', { track: Array.from({ length: 41 }, () => storm.track[0]) }],
    ['missing title', { title: '' }],
  ])('refuses an event with %s', (_label, over) => {
    const out = parseRunnerPayload(payload({ events: result('nasa-eonet', [storm, storm, { ...storm, id: 'EONET_bad', ...over }]) }), now);
    expect(out.ok && out.feeds.events!.items).toHaveLength(2);
    expect(out.dropped).toMatchObject([{ feed: 'events', id: 'EONET_bad' }]);
  });

  it('checks the source of NASA feeds', () => {
    const out = parseRunnerPayload(payload({ fires: result('nasa-eonet', [fire('a')]), events: result('nasa-eonet', [storm]) }), now);
    expect(out.ok && Object.keys(out.feeds)).toEqual(['events']);
  });
});

/** A row of square districts 0.01° wide, west to east from 100.40 E. */
const districts: ZoneFeature[] = Array.from({ length: 20 }, (_, i) => {
  const [w, e, s, n] = [100.4 + i * 0.01, 100.41 + i * 0.01, 13.7, 13.71];
  return {
    type: 'Feature',
    properties: { id: `D${i}`, parent: 'TH10', level: 2, name_th: `เขต ${i}`, name_en: `District ${i}`, bbox: [w, s, e, n] },
    geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
  };
});
const inDistrict = (i: number) => ({ lat: 13.705, lng: 100.405 + i * 0.01 });

/** One rain gauge per district; the first `danger` districts read 70 mm/h. */
const rainFeed = (danger: number, at = fetchedAt): FeedMap => ({
  rain: result(
    'bma-rain',
    districts.map((_, i) =>
      rain(`R${i}`, { location: inDistrict(i), observedAt: at, ...(i < danger ? { value: 70, severity: 'danger' } : {}) }),
    ),
  ) as FeedMap['rain'],
});

describe('suspiciousJump', () => {
  it('flags most districts turning danger in one upload', () => {
    const verdict = suspiciousJump(rainFeed(0), rainFeed(15), districts, now);
    expect(verdict).toMatchObject({ suspicious: true, districtsWithData: 20 });
    expect(verdict.newDanger).toHaveLength(15);
  });

  it('lets a heavy storm over part of the area through', () => {
    expect(suspiciousJump(rainFeed(0), rainFeed(9), districts, now).suspicious).toBe(false);
    // Already widespread before: the new upload only adds a few.
    expect(suspiciousJump(rainFeed(8), rainFeed(17), districts, now).suspicious).toBe(false);
  });

  it('is never suspicious without a fresh baseline', () => {
    expect(suspiciousJump(null, rainFeed(20), districts, now).suspicious).toBe(false);
    expect(suspiciousJump(rainFeed(0, '2026-10-05T03:00:00Z'), rainFeed(20), districts, now).suspicious).toBe(false);
  });

  it('is not moved by NASA feeds (display only)', () => {
    const fires = { fires: result('nasa-firms', districts.map((_, i) => fire(`F${i}`, { location: inDistrict(i), frp: 5000 }))) } as FeedMap;
    const events = { events: result('nasa-eonet', [{ ...storm, location: inDistrict(0) }]) } as FeedMap;
    const verdict = suspiciousJump({ ...rainFeed(0), ...fires }, { ...rainFeed(0), ...fires, ...events }, districts, now);
    expect(verdict).toMatchObject({ suspicious: false, newDanger: [], districtsWithData: 20 });
  });

  it('ignores a failed feed, as the store keeps its previous items', () => {
    const failed = { rain: { ...rainFeed(20).rain!, ok: false } };
    expect(suspiciousJump(rainFeed(0), failed, districts, now).suspicious).toBe(false);
  });

  it('gives the same verdict with a zone index as with the plain list', () => {
    const index = buildZoneIndex(districts);
    for (const [prev, next] of [
      [rainFeed(0), rainFeed(15)],
      [rainFeed(0), rainFeed(9)],
      [rainFeed(8), rainFeed(17)],
      [null, rainFeed(20)],
    ] as const) {
      expect(suspiciousJump(prev, next, index, now)).toEqual(suspiciousJump(prev, next, districts, now));
    }
  });
});
