import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  air4thai,
  defaultContext,
  parseAir4Thai,
  parseBmaFlood,
  parseBmaRain,
  parseBmaTraffic,
  parseOpenMeteo,
  parseRadars,
  parseTmdQuakeRss,
  parseUsgs,
  parseWaterLevel,
} from '../src';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const json = (name: string) => JSON.parse(fixture(name));
const ctx = defaultContext({ now: new Date('2026-10-03T15:00:00Z') });

describe('air4thai', () => {
  const obs = parseAir4Thai(json('air4thai.json'), ctx);
  it('keeps only stations in active regions', () => {
    expect(obs).toHaveLength(3);
    expect(obs.every((o) => o.location.lat > 13 && o.location.lat < 14.3)).toBe(true);
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
  it('keeps water level stations in active regions', () => {
    const obs = parseWaterLevel(json('thaiwater-waterlevel.json'), ctx);
    expect(obs).toHaveLength(4);
    expect(obs.every((o) => o.kind === 'waterlevel')).toBe(true);
  });
  it('keeps only radars of active regions, with UTC times', () => {
    const frames = parseRadars(json('thaiwater-main.json'), ctx);
    expect(frames.map((f) => f.radarId).sort()).toEqual(['njk', 'nkm', 'svp120']);
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
    expect(w).toMatchObject({ temperatureC: 28.5, observedAt: '2026-10-03T14:45:00.000Z' });
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
