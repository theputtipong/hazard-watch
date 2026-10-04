import { describe, expect, it } from 'vitest';
import {
  REGIONS,
  activeRegions,
  inRegions,
  regionFor,
  regionRadars,
  DEFAULT_CONFIG,
  bmaFloodSeverity,
  distanceKm,
  mergeConfig,
  pm25Severity,
  pm25ShouldPush,
  quakeSeverity,
  rainSeverity,
  worst,
  type Earthquake,
} from '../src';
import { messages, t } from '../src/i18n';

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
  it('computes distances', () => {
    expect(distanceKm(BANGKOK_CENTER, { lat: 22.01, lng: 95.92 })).toBeGreaterThan(1000);
    expect(distanceKm(BANGKOK_CENTER, { lat: 22.01, lng: 95.92 })).toBeLessThan(1100);
  });
});

describe('flood and rain', () => {
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
    for (const [key, v] of Object.entries(messages)) {
      expect(v.th, key).not.toBe('');
      expect(v.en, key).not.toBe('');
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
  it('lists radars without duplicates', () => {
    expect(regionRadars([...regions, ...regions])).toEqual(['nkm', 'njk', 'svp120']);
  });
});
