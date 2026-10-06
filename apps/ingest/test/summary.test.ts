import { describe, expect, it } from 'vitest';
import { buildSummary } from '../src/summary';

const now = new Date('2026-10-05T16:00:00Z');
const obs = (id: string, value: number | null, severity: string, extra: object = {}) => ({
  id,
  kind: 'pm25',
  source: 'air4thai',
  name: { th: id, en: id },
  location: { lat: 13.75, lng: 100.5 },
  observedAt: '2026-10-05T15:30:00Z',
  value,
  unit: 'µg/m³',
  severity,
  ...extra,
});
const quake = (id: string, magnitude: number, lat: number, lng: number, occurredAt = '2026-10-05T10:00:00Z') => ({
  id,
  source: 'tmd',
  magnitude,
  depthKm: 10,
  location: { lat, lng },
  place: { th: id, en: id },
  occurredAt,
});
const feed = (items: unknown[], ok = true) => ({ source: 'air4thai' as const, fetchedAt: now.toISOString(), ok, items });

describe('buildSummary', () => {
  it('picks the worst live reading and skips offline or stale ones', () => {
    const s = buildSummary(
      {
        updatedAt: '2026-10-05T15:50:00Z',
        feeds: {
          pm25: feed([
            obs('a', 20, 'watch'),
            obs('b', 48, 'warn'),
            obs('offline', 300, 'danger', { offline: true }),
            obs('stale', 200, 'danger', { observedAt: '2026-10-05T12:00:00Z' }),
            obs('null', null, 'ok'),
          ]),
        },
      },
      null,
      now,
    );
    expect(s.pm25).toEqual({ worst: { value: 48, severity: 'warn', name: { th: 'b', en: 'b' } }, stations: 2 });
  });

  it('counts water gauges at warn or above', () => {
    const s = buildSummary(null, { updatedAt: '2026-10-05T15:40:00Z', feeds: { waterlevel: feed([obs('x', 60, 'ok'), obs('y', 105, 'warn'), obs('z', 125, 'danger')]) } }, now);
    expect(s.water).toMatchObject({ worst: { value: 125 }, stations: 3, alerts: 2 });
  });

  it('keeps the largest recent quake within range only', () => {
    const s = buildSummary(
      {
        updatedAt: '2026-10-05T15:50:00Z',
        feeds: {
          quakesTmd: feed([quake('near', 4.7, 18.0, 98.0), quake('old', 6.5, 18.0, 98.0, '2026-10-03T00:00:00Z')]),
          quakesUsgs: feed([quake('far', 6.9, 35.0, 139.0)]),
        },
      },
      null,
      now,
    );
    expect(s.quake).toMatchObject({ magnitude: 4.7, place: { en: 'near' }, severity: 'ok' });
  });

  it('reports the newest update time and feed health', () => {
    const s = buildSummary(
      { updatedAt: '2026-10-05T15:50:00Z', feeds: { pm25: feed([]) } },
      { updatedAt: '2026-10-05T15:40:00Z', feeds: { flood: feed([], false) } },
      now,
    );
    expect(s).toMatchObject({ updatedAt: '2026-10-05T15:50:00Z', pm25: null, water: null, quake: null, feeds: { ok: 1, total: 2 } });
  });
});
