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
});
