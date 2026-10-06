import { describe, expect, it } from 'vitest';
import type { DashboardSnapshot, Observation } from '@hw/core';
import { districtAt, districtById, feedStatuses, floodInDistrict, localAlerts, nearestLive, wantedAlerts } from '../src/status';

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

describe('feed status', () => {
  it('flags failing and stale feeds, skipping the daily CCTV list', () => {
    const snap = snapshot({
      runnerFeeds: {
        rain: feed([], { ok: false, error: '403', lastOkAt: minsAgo(2000) }),
        radar: feed([], { fetchedAt: minsAgo(400), lastOkAt: minsAgo(400) }),
        cctv: feed([], { fetchedAt: minsAgo(1000) }),
      },
    });
    const byKey = Object.fromEntries(feedStatuses(snap, now).map((f) => [f.key, f.state]));
    expect(byKey).toMatchObject({ rain: 'failed', radar: 'stale', pm25: 'ok', flood: 'ok' });
    expect(byKey).not.toHaveProperty('cctv');
  });
});
