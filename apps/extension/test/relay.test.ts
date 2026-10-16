import { describe, expect, it, vi } from 'vitest';
import type { DashboardSnapshot, RelayKind, SourceResult } from '@hw/core';
import { relayStale, type RelayDeps } from '../src/relay';

const now = new Date('2026-10-16T08:00:00Z');
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

const feed = (over: Partial<SourceResult<never>> = {}): SourceResult<never> => ({
  source: 'bma-flood',
  fetchedAt: minsAgo(1),
  lastOkAt: minsAgo(1),
  ok: true,
  items: [],
  ...over,
});

const snap = (feeds: NonNullable<DashboardSnapshot['runner']>['feeds'] | null): DashboardSnapshot => ({
  edge: null,
  runner: feeds ? { updatedAt: minsAgo(1), feeds } : null,
});

const raw: Record<RelayKind, unknown[]> = { flood: [{ id: 'f1' }], rain: [{ id: 'r1' }] };

function fakeDeps(over: Partial<RelayDeps> = {}) {
  const deps = {
    fetchBma: vi.fn(async (kind: RelayKind): Promise<unknown> => raw[kind]),
    relayBma: vi.fn(async (_kind: RelayKind, _raw: unknown): Promise<void> => {}),
    ...over,
  };
  return deps;
}

describe('relayStale', () => {
  it('does nothing while both feeds are fresh', async () => {
    const deps = fakeDeps();
    expect(await relayStale(snap({ flood: feed(), rain: feed() }), now, deps)).toEqual([]);
    expect(deps.fetchBma).not.toHaveBeenCalled();
    expect(deps.relayBma).not.toHaveBeenCalled();
  });

  it('fetches and relays only the stale kind, with the raw body', async () => {
    const deps = fakeDeps();
    const stale = feed({ fetchedAt: minsAgo(30), lastOkAt: minsAgo(30) });
    expect(await relayStale(snap({ flood: stale, rain: feed() }), now, deps)).toEqual(['flood']);
    expect(deps.fetchBma).toHaveBeenCalledExactlyOnceWith('flood');
    expect(deps.relayBma).toHaveBeenCalledExactlyOnceWith('flood', raw.flood);
  });

  it('relays a failing feed even if it was fetched just now', async () => {
    const deps = fakeDeps();
    const failing = feed({ ok: false, fetchedAt: minsAgo(1), lastOkAt: minsAgo(1) });
    expect(await relayStale(snap({ flood: feed(), rain: failing }), now, deps)).toEqual(['rain']);
  });

  it('relays both kinds when the runner group or its feeds are missing', async () => {
    const deps = fakeDeps();
    expect((await relayStale(snap(null), now, deps)).sort()).toEqual(['flood', 'rain']);
    expect((await relayStale(snap({}), now, deps)).sort()).toEqual(['flood', 'rain']);
    expect(deps.relayBma).toHaveBeenCalledTimes(4);
  });

  it('keeps relaying the other kind when one BMA fetch throws', async () => {
    const deps = fakeDeps({
      fetchBma: vi.fn(async (kind: RelayKind) => {
        if (kind === 'flood') throw new Error('offline');
        return raw[kind];
      }),
    });
    await expect(relayStale(snap(null), now, deps)).resolves.toEqual(['rain']);
    expect(deps.relayBma).toHaveBeenCalledExactlyOnceWith('rain', raw.rain);
  });

  it('resolves when the relay itself fails', async () => {
    const deps = fakeDeps({ relayBma: vi.fn(async () => Promise.reject(new Error('HTTP 403'))) });
    await expect(relayStale(snap(null), now, deps)).resolves.toEqual([]);
    expect(deps.relayBma).toHaveBeenCalledTimes(2);
  });

  it('skips non-array BMA bodies', async () => {
    const deps = fakeDeps({ fetchBma: vi.fn(async () => ({ error: 'maintenance' })) });
    await expect(relayStale(snap(null), now, deps)).resolves.toEqual([]);
    expect(deps.relayBma).not.toHaveBeenCalled();
  });
});
