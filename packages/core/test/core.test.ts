import { describe, expect, it } from 'vitest';
import {
  REGIONS,
  activeRegions,
  inRegions,
  regionFor,
  DEFAULT_CONFIG,
  bmaFloodSeverity,
  distanceKm,
  mergeConfig,
  pm25Severity,
  pm25ShouldPush,
  quakeAlertFloor,
  quakeSeverity,
  rainSeverity,
  worst,
  type Earthquake,
} from '../src';
import { messages, t } from '../src/i18n';
import {
  districtAlerts,
  groupByZone,
  inZone,
  loosestQuakeLimit,
  personalQuakeLimit,
  pickChoice,
  quakeAlerts,
  summarizeZone,
  type Observation,
  type ZoneFeature,
} from '../src';

const cfg = DEFAULT_CONFIG;
const BANGKOK_CENTER = REGIONS['th-bangkok-metro'].center;

describe('pm25', () => {
  it('uses WHO-based display bands', () => {
    expect(pm25Severity(9, cfg)).toBe('ok');
    expect(pm25Severity(21.7, cfg)).toBe('watch');
    expect(pm25Severity(50, cfg)).toBe('warn');
    expect(pm25Severity(120, cfg)).toBe('danger');
  });
  it('pushes at the Thai standard by default', () => {
    expect(pm25ShouldPush(37.4, cfg)).toBe(false);
    expect(pm25ShouldPush(37.5, cfg)).toBe(true);
  });
  it('respects overrides', () => {
    const custom = mergeConfig({ pm25: { pushAt: 15 } });
    expect(custom.pm25.pushAt).toBe(15);
    expect(custom.pm25.bands.watch).toBe(37.5);
    expect(DEFAULT_CONFIG.pm25.pushAt).toBe(37.5);
  });
});

describe('quake', () => {
  const quake = (magnitude: number, lat: number, lng: number): Earthquake => ({
    id: 'x', source: 'usgs', magnitude, depthKm: 10, location: { lat, lng },
    place: { th: '', en: '' }, occurredAt: '2025-03-28T06:20:52Z',
  });
  it('alerts for a large quake inside the radius (Myanmar 2025)', () => {
    expect(quakeSeverity(quake(7.7, 22.01, 95.92), BANGKOK_CENTER, cfg)).toBe('danger');
  });
  it('ignores small or distant quakes', () => {
    expect(quakeSeverity(quake(5.9, 22.01, 95.92), BANGKOK_CENTER, cfg)).toBe('ok');
    expect(quakeSeverity(quake(7.5, 35.6, 139.7), BANGKOK_CENTER, cfg)).toBe('ok');
  });
  it('uses configurable tiers', () => {
    const custom = mergeConfig({ quake: { tiers: [{ severity: 'watch', minMagnitude: 4.5, maxDistanceKm: 800 }] } });
    expect(quakeSeverity(quake(4.6, 18.76, 102.3), BANGKOK_CENTER, custom)).toBe('watch');
    expect(quakeSeverity(quake(7.7, 22.01, 95.92), BANGKOK_CENTER, custom)).toBe('ok');
    expect(custom.quake.tiers).toHaveLength(1);
    expect(quakeAlertFloor(cfg)).toEqual({ minMagnitude: 6, maxDistanceKm: 1500 });
  });
  it('computes distances', () => {
    expect(distanceKm(BANGKOK_CENTER, { lat: 22.01, lng: 95.92 })).toBeGreaterThan(1000);
    expect(distanceKm(BANGKOK_CENTER, { lat: 22.01, lng: 95.92 })).toBeLessThan(1100);
  });
});

describe('flood and rain', () => {
  it('maps BMA sub-status through config', () => {
    const strict = mergeConfig({ flood: { bmaSubStatus: { 2: 'warn', 3: 'danger' } } });
    expect(bmaFloodSeverity(2, 5, strict)).toBe('warn');
    expect(bmaFloodSeverity(3, 5, strict)).toBe('danger');
  });
  it('maps BMA sub-status', () => {
    expect(bmaFloodSeverity(1, 0, cfg)).toBe('ok');
    expect(bmaFloodSeverity(2, 10, cfg)).toBe('watch');
    expect(bmaFloodSeverity(3, 20, cfg)).toBe('warn');
    expect(bmaFloodSeverity(3, 35, cfg)).toBe('danger');
  });
  it('grades hourly rain', () => {
    expect(rainSeverity(0, cfg)).toBe('ok');
    expect(rainSeverity(40, cfg)).toBe('warn');
  });
  it('takes the worst severity', () => {
    expect(worst(['ok', 'warn', 'watch'])).toBe('warn');
    expect(worst([])).toBe('ok');
  });
});

describe('i18n', () => {
  it('has both languages for every key', () => {
    // Thai place-name prefixes (เขต, แขวง, อำเภอ, ตำบล) have no English equivalent, so English may be empty.
    const optionalEn = (key: string) => key.startsWith('zone.prefix');
    for (const [key, v] of Object.entries(messages)) {
      expect(v.th, key).not.toBe('');
      if (!optionalEn(key)) expect(v.en, key).not.toBe('');
    }
  });
  it('fills placeholders', () => {
    expect(t('quake.none', 'en', { mag: 6, km: 1500, days: 7 })).toBe('No M6+ within 1500 km in the past 7 days');
  });
});

describe('regions', () => {
  const regions = activeRegions();
  it('filters points by active regions', () => {
    expect(inRegions({ lat: 13.73, lng: 100.49 }, regions)).toBe(true);
    expect(inRegions({ lat: 18.79, lng: 98.98 }, regions)).toBe(false);
  });
  it('falls back to the first region for the map view', () => {
    expect(regionFor({ lat: 18.79, lng: 98.98 }).id).toBe('th-bangkok-metro');
    expect(regionFor(null).id).toBe('th-bangkok-metro');
  });
});

describe('zones', () => {
  const square = (id: string, x0: number, y0: number, x1: number, y1: number): ZoneFeature => ({
    type: 'Feature',
    properties: { id, parent: null, level: 3, name_th: id, name_en: id, bbox: [x0, y0, x1, y1] },
    geometry: { type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] },
  });
  const a = square('A', 100, 13, 100.5, 13.5);
  const b = square('B', 100.5, 13, 101, 13.5);
  const obs = (kind: Observation['kind'], lng: number, severity: Observation['severity'], value: number | null = 1): Observation => ({
    id: `${kind}${lng}${severity}`, kind, source: 'bma-flood', name: { th: '', en: '' }, location: { lat: 13.2, lng },
    observedAt: new Date().toISOString(), value, unit: '', severity,
  });
  it('finds the containing zone', () => {
    expect(inZone(a, { lat: 13.2, lng: 100.2 })).toBe(true);
    expect(inZone(a, { lat: 13.2, lng: 100.7 })).toBe(false);
  });
  it('groups readings and takes the worst', () => {
    const groups = groupByZone([obs('flood', 100.1, 'ok'), obs('flood', 100.2, 'warn'), obs('pm25', 100.7, 'watch', 30)], [a, b]);
    const sa = summarizeZone(groups.get('A')!, cfg);
    expect(sa).toMatchObject({ severity: 'warn', flooded: 1, readings: 2 });
    expect(summarizeZone(groups.get('B')!, cfg)).toMatchObject({ severity: 'watch', pm25Max: 30 });
  });
  it('ignores stale readings', () => {
    const old = { ...obs('flood', 100.1, 'danger'), observedAt: '2026-01-01T00:00:00Z' };
    expect(summarizeZone([old], cfg)).toMatchObject({ severity: null, stale: 1 });
  });
  it('reports no data instead of normal for empty zones', () => {
    expect(summarizeZone([], cfg).severity).toBeNull();
    expect(summarizeZone([{ ...obs('flood', 100.1, 'ok'), offline: true }], cfg).severity).toBeNull();
  });
});

describe('push alerts', () => {
  const district: ZoneFeature = {
    type: 'Feature',
    properties: { id: 'TH1001', parent: 'TH10', level: 2, name_th: 'พระนคร', name_en: 'Phra Nakhon', bbox: [100, 13, 101, 14] },
    geometry: { type: 'Polygon', coordinates: [[[100, 13], [101, 13], [101, 14], [100, 14], [100, 13]]] },
  };
  const reading = (kind: Observation['kind'], value: number, severity: Observation['severity'], observedAt = new Date().toISOString()): Observation => ({
    id: `${kind}${value}`, kind, source: 'bma-flood', name: { th: 'จุด', en: 'Spot' }, location: { lat: 13.5, lng: 100.5 },
    observedAt, value, unit: '', severity,
  });
  it('builds flood, rain, water and PM2.5 alerts from config thresholds', () => {
    const alerts = districtAlerts(
      [reading('flood', 20, 'warn'), reading('rain', 40, 'warn'), reading('waterlevel', 105, 'warn'), reading('pm25', 40, 'warn'), reading('pm25', 20, 'watch')],
      [district],
      cfg,
    ).get('TH1001')!;
    expect(alerts.map((a) => a.kind).sort()).toEqual(['flood', 'pm25', 'rain', 'water']);
    expect(alerts.find((a) => a.kind === 'flood')!.title.th).toBe('น้ำท่วมขังในพระนคร');
    expect(alerts.find((a) => a.kind === 'pm25')).toMatchObject({ key: 'pm25:TH1001', value: 40 });
  });
  it('ignores stale readings and values under the thresholds', () => {
    const old = '2026-01-01T00:00:00Z';
    const alerts = districtAlerts([reading('flood', 20, 'warn', old), reading('rain', 5, 'ok'), reading('pm25', 12, 'ok')], [district], cfg).get('TH1001')!;
    expect(alerts).toEqual([]);
  });
  it('builds quake alerts from the quake tiers', () => {
    const q = { id: 'usgs:x', source: 'usgs' as const, magnitude: 7.7, depthKm: 10, location: { lat: 22.01, lng: 95.92 }, place: { th: 'เมียนมา', en: 'Myanmar' }, occurredAt: new Date().toISOString() };
    const a = quakeAlerts([q], district, cfg);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: 'quake', severity: 'danger', key: 'quake:usgs:x', value: 7.7 });
  });

  describe('personal quake limit', () => {
    // Myanmar epicentre is ~1,040 km from this district's centre.
    const myanmar = (id: string, magnitude: number): Earthquake => ({
      id, source: 'usgs', magnitude, depthKm: 10, location: { lat: 22.01, lng: 95.92 },
      place: { th: 'เมียนมา', en: 'Myanmar' }, occurredAt: new Date().toISOString(),
    });
    const quakes = [myanmar('a', 5.4), myanmar('b', 6.2), myanmar('c', 7.7)];
    const keys = (limit?: Parameters<typeof quakeAlerts>[4]) => quakeAlerts(quakes, district, cfg, new Date(), limit).map((a) => a.key);

    it('defaults to the central quake tiers', () => {
      expect(personalQuakeLimit(cfg)).toEqual(quakeAlertFloor(cfg));
      expect(personalQuakeLimit(cfg, { minMagnitude: null, maxDistanceKm: null })).toEqual({ minMagnitude: 6, maxDistanceKm: 1500 });
      expect(keys(personalQuakeLimit(cfg))).toEqual(keys());
      expect(keys()).toEqual(['quake:b', 'quake:c']);
    });
    it('the central default is one of the offered choices', () => {
      const floor = quakeAlertFloor(cfg);
      expect(cfg.push.quakeChoices.minMagnitude).toContain(floor.minMagnitude);
      expect(cfg.push.quakeChoices.maxDistanceKm).toContain(floor.maxDistanceKm);
    });
    it('filters by the person’s magnitude and distance', () => {
      const m5 = quakeAlerts(quakes, district, cfg, new Date(), { minMagnitude: 5, maxDistanceKm: 1500 });
      expect(m5.map((a) => a.key)).toEqual(['quake:a', 'quake:b', 'quake:c']);
      expect(m5[0]!.severity).toBe('watch');
      expect(keys({ minMagnitude: 7, maxDistanceKm: 1500 })).toEqual(['quake:c']);
      expect(keys({ minMagnitude: 5, maxDistanceKm: 1000 })).toEqual([]);
      expect(keys({ minMagnitude: 5, maxDistanceKm: 500 })).toEqual([]);
    });
    it('only accepts the offered choices', () => {
      expect(pickChoice(5, [5, 6, 7])).toBe(5);
      expect(pickChoice('7', [5, 6, 7])).toBe(7);
      for (const bad of [5.5, 0, -1, 2000, '', 'x', null, undefined, NaN, {}]) expect(pickChoice(bad, [5, 6, 7])).toBeNull();
      expect(personalQuakeLimit(cfg, { minMagnitude: 4, maxDistanceKm: 9999 })).toEqual({ minMagnitude: 6, maxDistanceKm: 1500 });
      expect(personalQuakeLimit(cfg, { minMagnitude: 5, maxDistanceKm: 500 })).toEqual({ minMagnitude: 5, maxDistanceKm: 500 });
    });
    it('knows the widest limit anyone can pick', () => {
      expect(loosestQuakeLimit(cfg)).toEqual({ minMagnitude: 5, maxDistanceKm: 1500 });
    });
  });
});
