import { describe, expect, it } from 'vitest';
import { mergeWithPrevious } from '../src/store';

describe('mergeWithPrevious', () => {
  const prev = {
    updatedAt: '2026-10-03T14:00:00Z',
    feeds: { pm25: { source: 'air4thai' as const, fetchedAt: '2026-10-03T14:00:00Z', ok: true, items: [1, 2] } },
  };
  it('keeps old items when the new fetch failed', () => {
    const out = mergeWithPrevious({ pm25: { source: 'air4thai', fetchedAt: 'now', ok: false, error: '403', items: [] } }, prev);
    expect(out.pm25).toMatchObject({ ok: false, error: '403', items: [1, 2], fetchedAt: '2026-10-03T14:00:00Z' });
  });
  it('replaces items on success', () => {
    const out = mergeWithPrevious({ pm25: { source: 'air4thai', fetchedAt: 'now', ok: true, items: [3] } }, prev);
    expect(out.pm25!.items).toEqual([3]);
  });
  it('keeps a feed that was not fetched this run (e.g. the daily CCTV list)', () => {
    const out = mergeWithPrevious({ quakesUsgs: { source: 'usgs', fetchedAt: 'now', ok: true, items: [] } }, prev);
    expect(out.pm25).toMatchObject({ ok: true, items: [1, 2], fetchedAt: '2026-10-03T14:00:00Z' });
    expect(out.quakesUsgs!.fetchedAt).toBe('now');
  });
});

describe('outage timestamps', () => {
  const ok = (at: string) => ({ source: 'air4thai' as const, fetchedAt: at, ok: true, items: [1] });
  const fail = (at: string) => ({ source: 'air4thai' as const, fetchedAt: at, ok: false, error: '403', items: [] });
  const group = (feeds: ReturnType<typeof mergeWithPrevious>) => ({ updatedAt: 'x', feeds });

  it('stamps lastOkAt on success and clears failingSince', () => {
    const out = mergeWithPrevious({ pm25: ok('T2') }, group({ pm25: { ...fail('T1'), failingSince: 'T0' } }));
    expect(out.pm25).toMatchObject({ ok: true, lastOkAt: 'T2' });
    expect(out.pm25!.failingSince).toBeUndefined();
  });
  it('keeps lastOkAt and the first failure time across failures', () => {
    const first = mergeWithPrevious({ pm25: fail('T2') }, group({ pm25: { ...ok('T1'), lastOkAt: 'T1' } }));
    expect(first.pm25).toMatchObject({ lastOkAt: 'T1', failingSince: 'T2' });
    const second = mergeWithPrevious({ pm25: fail('T3') }, group(first));
    expect(second.pm25).toMatchObject({ lastOkAt: 'T1', failingSince: 'T2' });
  });
  it('falls back to the previous fetchedAt for snapshots written before lastOkAt existed', () => {
    const out = mergeWithPrevious({ pm25: fail('T2') }, group({ pm25: ok('T1') }));
    expect(out.pm25).toMatchObject({ lastOkAt: 'T1', failingSince: 'T2' });
  });
  it('has no lastOkAt for a feed that never worked', () => {
    const out = mergeWithPrevious({ pm25: fail('T2') }, null);
    expect(out.pm25).toMatchObject({ failingSince: 'T2' });
    expect(out.pm25!.lastOkAt).toBeUndefined();
  });
});
