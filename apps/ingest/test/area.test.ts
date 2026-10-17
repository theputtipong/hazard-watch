import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DashboardSnapshot } from '@hw/core';
import { describe, expect, it } from 'vitest';
import { buildAreaReport, DAM_PICK, districtAt, districtList, findDistrict } from '../src/area';

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

// NASA and dam feeds ride on a copy so snapshot.json (the map fixture) stays as it was.
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
// ThaiWater dams: daily, observedAt is 00:00 ICT of the report day. Distances from Phra Nakhon's centre in comments.
const TODAY = '2026-10-04T17:00:00.000Z';
const dam = (
  id: string,
  size: 'large' | 'medium',
  at: { lat: number; lng: number },
  o: { value?: number; usablePct?: number | null; basin?: string | null; province?: string; observedAt?: string; severity?: string } = {},
) => ({
  id: `thaiwater-dam:${size}:${id}`,
  kind: 'dam',
  source: 'thaiwater',
  name: { th: `เขื่อน ${id}`, en: size === 'large' ? `Dam ${id}` : `เขื่อน ${id}` },
  location: at,
  observedAt: o.observedAt ?? TODAY,
  value: o.value ?? 62.5,
  unit: '%',
  severity: o.severity ?? 'ok',
  extra: {
    storageMcm: 600.5,
    capacityMcm: 960.8,
    usablePct: o.usablePct === undefined ? 55.1 : o.usablePct,
    inflowMcm: size === 'large' ? 4.2 : null,
    releaseMcm: size === 'large' ? 1.5 : null,
    size,
    basin: o.basin === undefined ? 'ลุ่มน้ำอื่น' : o.basin,
    province: o.province ?? 'จังหวัดอื่น',
    agency: 'กรมชลประทาน',
  },
});
const pasak = dam('pasak', 'large', { lat: 14.87, lng: 101.07 }, { value: 105.2, basin: 'ลุ่มน้ำป่าสัก', province: 'ลพบุรี', severity: 'danger' }); // 138 km
const srin = dam('srin', 'large', { lat: 14.41, lng: 99.13 }, { basin: 'ลุ่มน้ำแม่กลอง', province: 'กาญจนบุรี' }); // 165 km
const bhumi = dam('bhumi', 'large', { lat: 17.24, lng: 98.97 }, { basin: 'ลุ่มน้ำปิง', province: 'ตาก' }); // 421 km
const m1 = dam('m1', 'medium', { lat: 13.95, lng: 100.75 }, { value: 35, usablePct: 20, basin: 'ลุ่มน้ำบางปะกง', province: 'ฉะเชิงเทรา' }); // 34.7 km
const mFar = dam('mfar', 'medium', { lat: 14.5, lng: 100.6 }, { basin: 'ลุ่มน้ำบางปะกง' }); // 83 km
const damFeed = (items: unknown[]) => ({ dams: feed('thaiwater', items) });

const withNasa = {
  ...snapshot,
  runner: { ...snapshot.runner!, feeds: { ...snapshot.runner!.feeds, ...nasaFeeds, ...damFeed([pasak, srin, bhumi, m1, mFar]) } },
} as unknown as DashboardSnapshot;

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

  it('lists dams near the district: nearest large within 300 km, nearest medium within 50 km', () => {
    expect(report.dams.map((d) => d.id)).toEqual(['thaiwater-dam:medium:m1', 'thaiwater-dam:large:pasak']);
    expect(report.dams[0]).toEqual({
      id: 'thaiwater-dam:medium:m1',
      name: { th: 'เขื่อน m1', en: 'เขื่อน m1' },
      size: 'medium',
      km: 34.7,
      storagePct: 35,
      usablePct: 20,
      storageMcm: 600.5,
      capacityMcm: 960.8,
      inflowMcm: null,
      releaseMcm: null,
      status: 'critical',
      province: 'ฉะเชิงเทรา',
      basin: 'ลุ่มน้ำบางปะกง',
      observedAt: TODAY,
      stale: false,
    });
    expect(report.dams[1]).toMatchObject({ size: 'large', status: 'over', inflowMcm: 4.2, releaseMcm: 1.5 });
  });

  const dams = (items: unknown[], base: DashboardSnapshot = snapshot) =>
    buildAreaReport({ ...base, runner: { ...base.runner!, feeds: { ...base.runner!.feeds, ...damFeed(items) } } } as unknown as DashboardSnapshot, phraNakhon, now);
  const ids = (items: unknown[]) => dams(items).dams.map((d) => d.id.replace(/^thaiwater-dam:(large|medium):/, ''));

  it('fills the last slot with a large dam in the same province before a nearer unrelated one', () => {
    const bkk = dam('bkk', 'large', { lat: 15.5, lng: 100.5 }, { province: 'กรุงเทพมหานคร' }); // 194 km
    expect(ids([pasak, srin, m1, bkk])).toEqual(['m1', 'pasak', 'bkk']);
  });

  it('takes the district basin from the nearest dam within 50 km', () => {
    const sameBasin = dam('basin', 'large', { lat: 16.0, lng: 100.2 }, { basin: 'ลุ่มน้ำบางปะกง' }); // 252 km
    expect(ids([pasak, srin, m1, sameBasin])).toEqual(['m1', 'pasak', 'basin']);
    // Without a dam within 50 km there is no district basin, so it is not picked.
    expect(ids([pasak, srin, sameBasin])).toEqual(['pasak']);
  });

  // ThaiWater numbers large and medium dams separately; the size in the id keeps twins apart.
  it('keeps a large and a medium dam that share a ThaiWater id', () => {
    const twinLarge = dam('7', 'large', { lat: 14.87, lng: 101.07 }); // 138 km
    const twinMedium = dam('7', 'medium', { lat: 13.95, lng: 100.75 }); // 34.7 km
    expect(dams([twinLarge, twinMedium]).dams.map((d) => [d.id, d.size])).toEqual([
      ['thaiwater-dam:medium:7', 'medium'],
      ['thaiwater-dam:large:7', 'large'],
    ]);
  });

  it('then fills with further medium reservoirs within 50 km, never beyond the limits', () => {
    const m2 = dam('m2', 'medium', { lat: 13.85, lng: 100.62 }); // 16.8 km
    const m3 = dam('m3', 'medium', { lat: 14.0, lng: 100.3 }); // 34.6 km
    expect(ids([pasak, m1, m2, m3, mFar])).toEqual(['m2', 'm3', 'pasak']);
    expect(ids([bhumi, mFar])).toEqual([]);
    expect(DAM_PICK).toEqual({ max: 3, largeKm: 300, mediumKm: 50 });
  });

  it('flags dams whose report is older than yesterday as stale', () => {
    const yesterday = dam('y', 'medium', { lat: 13.85, lng: 100.62 }, { observedAt: '2026-10-03T17:00:00.000Z' });
    const older = dam('o', 'medium', { lat: 14.0, lng: 100.3 }, { observedAt: '2026-10-02T17:00:00.000Z' });
    expect(dams([yesterday, older]).dams.map((d) => [d.id, d.stale])).toEqual([
      ['thaiwater-dam:medium:y', false],
      ['thaiwater-dam:medium:o', true],
    ]);
  });

  it('keeps dams out of alerts, severity and calm (display only)', () => {
    const overInside = dam('in', 'medium', inside, { value: 150, severity: 'danger' });
    const calmSnapshot = {
      edge: null,
      runner: { updatedAt: now.toISOString(), feeds: { waterlevel: feed('thaiwater', [obs({ id: 'w', kind: 'waterlevel', value: 40, severity: 'ok', at: far })]) } },
    } as unknown as DashboardSnapshot;
    const withDam = dams([overInside, pasak], calmSnapshot);
    expect(withDam).toMatchObject({ severity: 'ok', calm: true, alerts: [] });
    expect(withDam.dams.map((d) => d.status)).toEqual(['over', 'over']);
    // Same alerts and level as without any dam feed.
    const plain = buildAreaReport(snapshot, phraNakhon, now);
    expect(dams([overInside])).toMatchObject({ alerts: plain.alerts, severity: plain.severity, calm: plain.calm });
  });

  it('always has dams, empty when the feed is missing', () => {
    expect(buildAreaReport(snapshot, phraNakhon, now).dams).toEqual([]);
    expect(buildAreaReport({ edge: null, runner: null } as DashboardSnapshot, phraNakhon, now).dams).toEqual([]);
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
