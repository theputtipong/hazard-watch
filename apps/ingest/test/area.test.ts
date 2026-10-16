import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DashboardSnapshot } from '@hw/core';
import { describe, expect, it } from 'vitest';
import { buildAreaReport, districtAt, districtList, findDistrict } from '../src/area';

// The mobile app's tests parse this exact response, so the two sides cannot drift.
// Regenerate after changing the report: UPDATE_FIXTURES=1 pnpm --filter @hw/ingest test
const CONTRACT = fileURLToPath(new URL('../../mobile/test/fixtures/area_report.json', import.meta.url));
const SNAPSHOT_CONTRACT = fileURLToPath(new URL('../../mobile/test/fixtures/snapshot.json', import.meta.url));

const now = new Date('2026-10-05T10:00:00Z');
const phraNakhon = findDistrict('TH1001')!;
// Inside Phra Nakhon (bbox 100.488–100.509, 13.739–13.773).
const inside = { lat: 13.755, lng: 100.5 };
const near = { lat: 13.76, lng: 100.52 };
const far = { lat: 13.9, lng: 100.6 };

const obs = (o: { id: string; kind: string; value: number | null; severity: string; at?: { lat: number; lng: number }; observedAt?: string; offline?: boolean; extra?: object }) => ({
  id: o.id,
  kind: o.kind,
  source: o.kind === 'pm25' ? 'air4thai' : o.kind === 'waterlevel' ? 'thaiwater' : o.kind === 'rain' ? 'bma-rain' : 'bma-flood',
  name: { th: `จุด ${o.id}`, en: `Station ${o.id}` },
  location: o.at ?? inside,
  observedAt: o.observedAt ?? '2026-10-05T09:40:00Z',
  value: o.value,
  unit: { pm25: 'µg/m³', waterlevel: '%', rain: 'mm/h', flood: 'cm' }[o.kind],
  severity: o.severity,
  ...(o.offline ? { offline: true } : {}),
  ...(o.extra ? { extra: o.extra } : {}),
});
const feed = (source: string, items: unknown[], extra: object = {}) => ({ source, fetchedAt: '2026-10-05T09:50:00Z', ok: true, lastOkAt: '2026-10-05T09:50:00Z', items, ...extra });

const snapshot = {
  edge: {
    updatedAt: '2026-10-05T09:50:00Z',
    feeds: {
      pm25: feed('air4thai', [obs({ id: 'pm-near', kind: 'pm25', value: 48.2, severity: 'warn' }), obs({ id: 'pm-far', kind: 'pm25', value: 12, severity: 'ok', at: far })]),
      quakesTmd: feed('tmd', [
        { id: 'q1', source: 'tmd', magnitude: 5.1, depthKm: 10, location: { lat: 19.9, lng: 99.0 }, place: { th: 'อ.แม่สาย จ.เชียงราย', en: 'Mae Sai, Chiang Rai' }, occurredAt: '2026-10-05T08:00:00Z' },
      ]),
      quakesUsgs: feed('usgs', []),
    },
  },
  runner: {
    updatedAt: '2026-10-05T09:45:00Z',
    feeds: {
      flood: feed('bma-flood', [
        obs({ id: 'f1', kind: 'flood', value: 25, severity: 'warn' }),
        obs({ id: 'f2', kind: 'flood', value: 5, severity: 'watch' }),
        obs({ id: 'f3', kind: 'flood', value: 0, severity: 'ok' }),
        obs({ id: 'f4', kind: 'flood', value: null, severity: 'ok', offline: true }),
      ]),
      rain: feed('bma-rain', [obs({ id: 'r1', kind: 'rain', value: 12.5, severity: 'watch', at: near })]),
      waterlevel: feed('thaiwater', [
        obs({ id: 'w1', kind: 'waterlevel', value: 86, severity: 'watch', at: near }),
        obs({ id: 'w2', kind: 'waterlevel', value: 44, severity: 'ok', at: far }),
        obs({ id: 'w-old', kind: 'waterlevel', value: 130, severity: 'danger', observedAt: '2026-10-04T09:00:00Z' }),
      ]),
      radar: { source: 'tmd', fetchedAt: '2026-10-05T07:00:00Z', ok: false, failingSince: '2026-10-05T07:00:00Z', lastOkAt: '2026-10-05T01:00:00Z', items: [] },
    },
  },
} as unknown as DashboardSnapshot;

// NASA feeds ride on a copy so snapshot.json (the map fixture) stays as it was.
const fire = (id: string, at: { lat: number; lng: number }, detectedAt = '2026-10-05T06:30:00Z') => ({
  id,
  location: at,
  detectedAt,
  frp: 4.2,
  confidence: 'nominal',
  satellite: 'N20',
  day: true,
});
const nasaFeeds = {
  fires: feed('nasa-firms', [
    fire('fire-near', near),
    fire('fire-out', far), // ~20 km, still inside the 25 km fire radius
    fire('fire-far', { lat: 14.5, lng: 101.0 }), // ~95 km
    fire('fire-old', near, '2026-10-04T06:00:00Z'), // older than 24 h
  ]),
  events: feed('nasa-eonet', [
    {
      id: 'EONET_1',
      category: 'severeStorms',
      title: 'Typhoon Test',
      location: { lat: 16.0, lng: 103.0 },
      track: [
        { at: '2026-10-05T00:00:00Z', location: { lat: 15.5, lng: 104.0 }, windKts: 60 },
        { at: '2026-10-05T06:00:00Z', location: { lat: 16.0, lng: 103.0 }, windKts: 55 },
      ],
      updatedAt: '2026-10-05T06:00:00Z',
      url: 'https://www.gdacs.org/report.aspx?eventid=1',
    },
    { id: 'EONET_2', category: 'volcanoes', title: 'Far Volcano', location: { lat: -6.1, lng: 105.4 }, track: [], updatedAt: '2026-10-01T00:00:00Z', url: null },
  ]),
};
const withNasa = { ...snapshot, runner: { ...snapshot.runner!, feeds: { ...snapshot.runner!.feeds, ...nasaFeeds } } } as unknown as DashboardSnapshot;

describe('buildAreaReport', () => {
  const report = buildAreaReport(withNasa, phraNakhon, now);

  it('names the district and its province', () => {
    expect(report.district).toMatchObject({ id: 'TH1001', name: { th: 'พระนคร', en: 'Phra Nakhon' }, province: { th: 'กรุงเทพมหานคร' } });
  });

  it('builds alerts with the Web Push rules, heaviest first', () => {
    expect(report.alerts.map((a) => [a.kind, a.severity])).toEqual([
      ['flood', 'warn'],
      ['pm25', 'warn'],
    ]);
    expect(report.alerts[0]!.title.th).toBe('ระวังมาก: น้ำท่วมบนถนนที่พระนคร');
    expect(report.severity).toBe('warn');
  });

  it('shows the nearest fresh readings and skips stale gauges while fresh ones exist', () => {
    expect(report.readings.pm25).toMatchObject({ id: 'pm-near', value: 48.2, severity: 'warn', stale: false });
    expect(report.readings.rain).toMatchObject({ id: 'r1', severity: 'watch' });
    expect(report.rivers.map((r) => r.id)).toEqual(['w1', 'w2']);
  });

  it('counts street-flood sensors inside the district', () => {
    expect(report.flood).toEqual({ flooded: 1, minor: 1, normal: 1, offline: 1, deepestCm: 25 });
  });

  it('gives USGS quake places a Thai name, as the web does', () => {
    const usgs = buildAreaReport(
      { edge: { updatedAt: now.toISOString(), feeds: { quakesUsgs: feed('usgs', [{ id: 'u', source: 'usgs', magnitude: 5.0, depthKm: 10, location: { lat: 20.0, lng: 97.0 }, place: { th: '', en: '40 km SE of Taunggyi, Myanmar' }, occurredAt: '2026-10-05T08:00:00Z' }]) } }, runner: null } as unknown as DashboardSnapshot,
      phraNakhon,
      now,
    );
    expect(usgs.quake?.place.th).toContain('เมียนมา');
    expect(usgs.quake?.place.en).toBe('40 km SE of Taunggyi, Myanmar');
  });

  it('keeps the latest regional quake even below alert level', () => {
    expect(report.quake).toMatchObject({ magnitude: 5.1, severity: 'ok' });
    expect(report.alerts.some((a) => a.kind === 'quake')).toBe(false);
  });

  it('reports feed health like the monitor', () => {
    expect(report.feeds.find((f) => f.topic === 'radar')).toMatchObject({ state: 'down', failingSince: '2026-10-05T07:00:00Z' });
    expect(report.feeds.find((f) => f.topic === 'pm25')).toMatchObject({ state: 'live' });
  });

  const rivers = (value: number, severity: string) =>
    buildAreaReport(
      { edge: null, runner: { updatedAt: now.toISOString(), feeds: { waterlevel: feed('thaiwater', [obs({ id: 'w', kind: 'waterlevel', value, severity, at: far })]) } } } as unknown as DashboardSnapshot,
      phraNakhon,
      now,
    );

  it('is calm only when nothing shown is at caution or above', () => {
    expect(rivers(40, 'ok')).toMatchObject({ severity: 'ok', calm: true, alerts: [] });
  });

  // Found with live data: a gauge 9.5 km away at 123 % made a quiet district read as danger.
  it('keeps a high gauge outside the district out of the district level, but not calm', () => {
    expect(rivers(123, 'danger')).toMatchObject({ severity: 'ok', calm: false, alerts: [] });
  });

  it('adds NASA fires and events near the district centre, display only', () => {
    expect(report.nasa?.fires).toMatchObject({ count: 2, radiusKm: 25 });
    expect(report.nasa?.events.map((e) => [e.id, e.windKts])).toEqual([['EONET_1', 55]]);
  });

  it('leaves nasa null when neither NASA feed exists', () => {
    expect(buildAreaReport(snapshot, phraNakhon, now).nasa).toBeNull();
  });

  it('matches the contract fixture the app tests read', () => {
    const json = `${JSON.stringify(report, null, 2)}\n`;
    if (process.env.UPDATE_FIXTURES) writeFileSync(CONTRACT, json);
    expect(readFileSync(CONTRACT, 'utf8')).toBe(json);
  });

  // The app's map reads /v1/snapshot, which serves this shape as stored.
  it('matches the snapshot fixture the app map tests read', () => {
    const json = `${JSON.stringify(snapshot, null, 2)}\n`;
    if (process.env.UPDATE_FIXTURES) writeFileSync(SNAPSHOT_CONTRACT, json);
    expect(readFileSync(SNAPSHOT_CONTRACT, 'utf8')).toBe(json);
  });
});

describe('districts', () => {
  it('lists every district with its province, Thai order', () => {
    const list = districtList();
    expect(list.length).toBe(928);
    expect(list.every((d) => d.province)).toBe(true);
    expect(new Set(list.map((d) => d.province!.th)).size).toBe(77);
  });

  it('finds the district at a point nationwide, or none outside Thailand', () => {
    expect(districtAt(inside)?.properties.id).toBe('TH1001');
    // Mueang Chiang Mai: outside the old Bangkok-metro coverage, inside the nationwide one.
    expect(districtAt({ lat: 18.79, lng: 98.98 })?.properties.id).toBe('TH5001');
    expect(districtAt({ lat: 10.0, lng: 90.0 })).toBeNull();
  });
});
