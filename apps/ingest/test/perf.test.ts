import { DEFAULT_CONFIG, districtAlerts, inZone, type Observation } from '@hw/core';
import { describe, expect, it } from 'vitest';
import { DISTRICT_IDS, DISTRICT_INDEX, DISTRICTS, districtAt } from '../src/geo';
import { MAX_BIND_PARAMS, subscriptionsIn, type SubscriptionRow } from '../src/push/store';

const now = new Date('2026-10-05T10:00:00Z');

/** Small seeded PRNG so a failure reproduces with the same points. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** Points spread over Thailand's box: some fall in a district, some in the sea or across the border. */
function points(n: number, seed = 7) {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({ lat: 5.6 + r() * 14.9, lng: 97.3 + r() * 8.4 }));
}

const kinds = ['pm25', 'rain', 'waterlevel', 'flood'] as const;
const readings: Observation[] = points(1500).map((location, i) => {
  const kind = kinds[i % kinds.length]!;
  return {
    id: `r${i}`,
    kind,
    source: kind === 'pm25' ? 'air4thai' : kind === 'waterlevel' ? 'thaiwater' : kind === 'rain' ? 'bma-rain' : 'bma-flood',
    name: { th: `จุด ${i}`, en: `Station ${i}` },
    location,
    observedAt: '2026-10-05T09:40:00Z',
    value: [40, 60, 110, 30][i % 4]!,
    unit: kind === 'pm25' ? 'µg/m³' : kind === 'waterlevel' ? '%' : kind === 'rain' ? 'mm/h' : 'cm',
    severity: i % 3 === 0 ? 'danger' : 'warn',
  } as Observation;
});

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

describe('push at 928 districts', () => {
  it('loads every district once with valid ids', () => {
    expect(DISTRICTS.length).toBe(928);
    expect(DISTRICT_IDS.size).toBe(928);
    expect(DISTRICT_INDEX.zones).toBe(DISTRICTS);
  });

  it('finds the same district as a linear scan', () => {
    for (const p of points(300, 11)) {
      expect(districtAt(p)?.properties.id ?? null).toBe(DISTRICTS.find((d) => inZone(d, p))?.properties.id ?? null);
    }
  });

  // The Worker has 10 ms CPU per cron run; grouping must leave room for everything else.
  it('runs districtAlerts for 1,500 readings × 928 districts in ≤5 ms (median)', () => {
    for (let i = 0; i < 3; i++) districtAlerts(readings, DISTRICT_INDEX, DEFAULT_CONFIG, now); // warm the JIT
    const times: number[] = [];
    let alerted = 0;
    for (let i = 0; i < 15; i++) {
      const t0 = performance.now();
      const out = districtAlerts(readings, DISTRICT_INDEX, DEFAULT_CONFIG, now);
      times.push(performance.now() - t0);
      alerted = [...out.values()].filter((l) => l.length).length;
    }
    console.log(`districtAlerts median ${median(times).toFixed(2)} ms, ${alerted} districts alerted`);
    expect(alerted).toBeGreaterThan(100);
    expect(median(times)).toBeLessThanOrEqual(5);
  });
});

describe('subscriptionsIn chunking', () => {
  /** Records every query's SQL and binds; returns rows for the districts bound, like D1 would. */
  function fakeDb(rows: SubscriptionRow[]) {
    const queries: { sql: string; binds: unknown[] }[] = [];
    const stmt = (sql: string, binds: unknown[] = []) => ({
      bind: (...a: unknown[]) => stmt(sql, a),
      all: async () => {
        queries.push({ sql, binds });
        const limit = Number(/LIMIT (\d+)/.exec(sql)![1]);
        const results = rows
          .filter((r) => binds.includes(r.district))
          .sort((a, b) => (a.failures ?? 0) - (b.failures ?? 0) || a.updated_at!.localeCompare(b.updated_at!))
          .slice(0, limit);
        return { results };
      },
    });
    return { db: { prepare: (sql: string) => stmt(sql) } as unknown as D1Database, queries };
  }

  const ids = [...DISTRICT_IDS].slice(0, 250);
  // Ages run opposite to id order, so the oldest rows sit in the last chunk and the merge must re-sort.
  const rows: SubscriptionRow[] = ids.map((district, i) => ({
    id: `s${i}`,
    endpoint: `https://push.example/${i}`,
    p256dh: 'k',
    auth: 'a',
    lang: 'th',
    district,
    subdistrict: null,
    prefs: '{}',
    quake_min_mag: null,
    quake_max_km: null,
    failures: i % 50 === 0 ? 1 : 0,
    updated_at: new Date(Date.UTC(2026, 9, 1) + (250 - i) * 60_000).toISOString(),
  }));

  it(`keeps every query at ≤${MAX_BIND_PARAMS} binds for 250 districts`, async () => {
    const { db, queries } = fakeDb(rows);
    const out = await subscriptionsIn(db, ids);
    expect(queries.length).toBe(Math.ceil(250 / MAX_BIND_PARAMS));
    for (const q of queries) {
      expect(q.binds.length).toBeLessThanOrEqual(MAX_BIND_PARAMS);
      // Placeholders and binds must line up, or D1 rejects the statement.
      expect(q.sql.match(/\?\d+/g)!.length).toBe(q.binds.length);
    }
    expect(out.length).toBe(250);
  });

  it('merges chunks in the same order as one query, and applies the limit overall', async () => {
    const { db } = fakeDb(rows);
    const out = await subscriptionsIn(db, ids, 20);
    const expected = [...rows].sort((a, b) => (a.failures ?? 0) - (b.failures ?? 0) || a.updated_at!.localeCompare(b.updated_at!)).slice(0, 20);
    expect(out.map((r) => r.id)).toEqual(expected.map((r) => r.id));
  });

  it('binds each district once even if listed twice', async () => {
    const { db, queries } = fakeDb(rows);
    await subscriptionsIn(db, [...ids.slice(0, 60), ...ids.slice(0, 60)]);
    expect(queries.length).toBe(1);
    expect(queries[0]!.binds.length).toBe(60);
  });
});
