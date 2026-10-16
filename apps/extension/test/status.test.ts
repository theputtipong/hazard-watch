import { describe, expect, it } from 'vitest';
import type { DashboardSnapshot, FireHotspot, NasaEvent, Observation } from '@hw/core';
import {
  DISTRICTS,
  PROVINCES,
  districtAt,
  districtById,
  districtsIn,
  floodInDistrict,
  localAlerts,
  nasaLines,
  nearestLive,
  provinceOf,
  wantedAlerts,
} from '../src/status';

const now = new Date('2026-10-06T08:00:00Z');
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
const siam = { lat: 13.7456, lng: 100.5341 }; // Pathum Wan, Bangkok

const obs = (over: Partial<Observation>): Observation =>
  ({
    id: Math.random().toString(36),
    source: 'x',
    kind: 'pm25',
    name: { th: 'สถานี', en: 'Station' },
    location: siam,
    value: 10,
    unit: '',
    severity: 'ok',
    observedAt: minsAgo(10),
    ...over,
  }) as Observation;

const feed = <T>(items: T[], over = {}) => ({ source: 'x', fetchedAt: minsAgo(5), ok: true, items, ...over }) as never;

function snapshot(over: { pm25?: Observation[]; flood?: Observation[]; runnerFeeds?: object; edgeFeeds?: object } = {}): DashboardSnapshot {
  return {
    edge: { updatedAt: minsAgo(5), feeds: { pm25: feed(over.pm25 ?? []), quakesTmd: feed([]), quakesUsgs: feed([]), ...over.edgeFeeds } },
    runner: { updatedAt: minsAgo(5), feeds: { flood: feed(over.flood ?? []), waterlevel: feed([]), ...over.runnerFeeds } },
  } as DashboardSnapshot;
}

describe('places', () => {
  it('finds the district around a point', () => {
    const d = districtAt(siam);
    expect(d?.properties.name_en).toMatch(/Pathum Wan/i);
    expect(districtById(d!.properties.id)).toBe(d);
  });

  it('locates a point outside Greater Bangkok (Chiang Mai old town)', () => {
    const d = districtAt({ lat: 18.7877, lng: 98.9931 })!;
    expect(d.properties.parent).toBe('TH50');
    expect(d.properties.name_en).toMatch(/Mueang Chiang Mai/i);
    expect(provinceOf(d)?.name_th).toBe('เชียงใหม่');
  });

  it('returns null outside Thailand', () => {
    expect(districtAt({ lat: 35.68, lng: 139.69 })).toBeNull();
  });

  it('covers 77 provinces with their districts and keeps old Bangkok ids', () => {
    expect(PROVINCES).toHaveLength(77);
    expect(PROVINCES[0]).toEqual({ id: 'TH10', parent: null, name_th: 'กรุงเทพมหานคร', name_en: 'Bangkok' });
    expect(PROVINCES.every((p) => districtsIn(p.id, 'th').length > 0)).toBe(true);
    expect(DISTRICTS).toHaveLength(928);
    expect(districtById('TH1001')?.properties.name_en).toBe('Phra Nakhon');
    const bkk = districtsIn('TH10', 'en').map((d) => d.properties.name_en);
    expect(bkk).toEqual([...bkk].sort((a, b) => a.localeCompare(b, 'en')));
  });
});

describe('NASA lines', () => {
  const district = districtAt(siam)!;
  const fire = (lat: number, lng: number, hoursAgo = 2): FireHotspot => ({
    id: `${lat},${lng}`,
    location: { lat, lng },
    detectedAt: minsAgo(hoursAgo * 60),
    frp: 5,
    confidence: 'nominal',
    satellite: 'N20',
    day: true,
  });
  const storm = (lat: number, lng: number): NasaEvent => ({
    id: 'EONET_1',
    category: 'severeStorms',
    title: 'Typhoon Test',
    location: { lat, lng },
    track: [],
    updatedAt: minsAgo(60),
    url: null,
  });
  const nasaSnap = (fires: FireHotspot[] | null, events: NasaEvent[] | null) =>
    snapshot({ runnerFeeds: { ...(fires && { fires: feed(fires) }), ...(events && { events: feed(events) }) } });

  it('says none when nothing is near', () => {
    const snap = nasaSnap([fire(18.8, 99.0)], [storm(35, 140)]);
    expect(nasaLines(snap, district, 'th', { now })).toEqual(['ไม่พบจุดความร้อนใกล้คุณในช่วง 24 ชม.']);
  });

  it('counts fires within 25 km and skips old ones', () => {
    // ~11 km and ~17 km from Siam; the third is 30 km away, the fourth is two days old.
    const snap = nasaSnap([fire(13.85, 100.53), fire(13.6, 100.6), fire(14.02, 100.53), fire(13.75, 100.53, 48)], []);
    expect(nasaLines(snap, district, 'th', { from: siam, now })).toEqual(['พบจุดความร้อน 2 จุดในระยะ 25 กม. ช่วง 24 ชม.']);
    expect(nasaLines(snap, district, 'en', { from: siam, now })).toEqual(['2 fire hotspots within 25 km in the past 24 h']);
  });

  it('adds the nearest storm within 500 km', () => {
    // ~3.6° of latitude ≈ 400 km south-east in the Gulf.
    const snap = nasaSnap([], [storm(10.5, 102.0), storm(30, 130)]);
    const lines = nasaLines(snap, district, 'en', { from: siam, now });
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^Storm Typhoon Test · \d+ km away$/);
    const km = Number(/(\d+) km/.exec(lines[1]!)![1]);
    expect(km).toBeGreaterThan(350);
    expect(km).toBeLessThanOrEqual(500);
  });

  it('is empty without NASA feeds and does not claim "none" without the fire feed', () => {
    expect(nasaLines(snapshot(), district, 'th', { now })).toEqual([]);
    expect(nasaLines({ edge: null, runner: null }, district, 'th', { now })).toEqual([]);
    expect(nasaLines(nasaSnap(null, []), district, 'th', { now })).toEqual([]);
  });
});

describe('alerts for one district', () => {
  const district = districtAt(siam)!;

  it('builds the same alerts as web push and applies personal choices', () => {
    const snap = snapshot({
      pm25: [obs({ value: 60, severity: 'warn' })],
      flood: [obs({ kind: 'flood', value: 25, severity: 'warn' })],
    });
    const all = localAlerts(snap, district, undefined, now);
    expect(all.map((a) => a.kind).sort()).toEqual(['flood', 'pm25']);
    expect(wantedAlerts(all, { kinds: ['flood', 'pm25'], pm25At: 75 }).map((a) => a.kind)).toEqual(['flood']);
    expect(wantedAlerts(all, { kinds: ['pm25'], pm25At: 37.5 }).map((a) => a.kind)).toEqual(['pm25']);
  });

  it('ignores stale readings', () => {
    const snap = snapshot({ flood: [obs({ kind: 'flood', value: 25, severity: 'warn', observedAt: minsAgo(300) })] });
    expect(localAlerts(snap, district, undefined, now)).toEqual([]);
    expect(floodInDistrict(snap, district, undefined, now)).toBeNull();
  });
});

describe('readings near me', () => {
  it('picks the nearest live station', () => {
    const near = obs({ id: 'near', location: { lat: 13.75, lng: 100.53 } });
    const far = obs({ id: 'far', location: { lat: 13.9, lng: 100.6 } });
    const offline = obs({ id: 'off', location: siam, offline: true });
    expect(nearestLive([far, near, offline], siam, undefined, now)?.id).toBe('near');
  });
});
