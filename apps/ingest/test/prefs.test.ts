import { DEFAULT_CONFIG, quakeAlertFloor } from '@hw/core';
import { describe, expect, it } from 'vitest';
import { cleanPrefs, quakeLimitFor } from '../src/push/prefs';

describe('cleanPrefs', () => {
  it('keeps allowed quake choices', () => {
    expect(cleanPrefs({ kinds: ['quake'], quakeMinMag: 5, quakeMaxKm: 500 })).toEqual({
      prefs: { kinds: ['quake'] },
      quakeMinMag: 5,
      quakeMaxKm: 500,
    });
  });
  it('turns unknown or missing quake values into null (central default)', () => {
    expect(cleanPrefs({ kinds: ['quake'] })).toMatchObject({ quakeMinMag: null, quakeMaxKm: null });
    expect(cleanPrefs({ quakeMinMag: 4.5, quakeMaxKm: 20000 })).toMatchObject({ quakeMinMag: null, quakeMaxKm: null });
    expect(cleanPrefs({ quakeMinMag: 'DROP TABLE', quakeMaxKm: { a: 1 } })).toMatchObject({ quakeMinMag: null, quakeMaxKm: null });
    expect(cleanPrefs(undefined)).toEqual({ prefs: { kinds: [] }, quakeMinMag: null, quakeMaxKm: null });
  });
  it('still filters kinds and the PM2.5 level', () => {
    expect(cleanPrefs({ kinds: ['flood', 'nope'], pm25At: 50 }).prefs).toEqual({ kinds: ['flood'], pm25At: 50 });
    expect(cleanPrefs({ kinds: 'flood', pm25At: -1 }).prefs).toEqual({ kinds: [] });
  });
});

describe('quakeLimitFor', () => {
  it('uses the central quake tiers when nothing was picked', () => {
    expect(quakeLimitFor({ quake_min_mag: null, quake_max_km: null })).toEqual(quakeAlertFloor(DEFAULT_CONFIG));
  });
  it('uses the stored choice', () => {
    expect(quakeLimitFor({ quake_min_mag: 7, quake_max_km: 1000 })).toEqual({ minMagnitude: 7, maxDistanceKm: 1000 });
  });
  it('falls back per field when a stored value is no longer offered', () => {
    expect(quakeLimitFor({ quake_min_mag: 4, quake_max_km: 500 })).toEqual({ minMagnitude: 6, maxDistanceKm: 500 });
  });
});
