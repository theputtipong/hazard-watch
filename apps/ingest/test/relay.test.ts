import { readFileSync } from 'node:fs';
import type { SourceResult } from '@hw/core';
import { describe, expect, it } from 'vitest';
import { keepRecentRelay, relayFeed, relayIsFresh } from '../src/relay';
import type { FeedMap, GroupSnapshot } from '../src/store';

const fixture = (name: string): Record<string, unknown>[] =>
  JSON.parse(readFileSync(new URL(`../../../packages/sources/test/fixtures/${name}.json`, import.meta.url), 'utf8'));
const floodRaw = fixture('bma-flood');
const rainRaw = fixture('bma-rain');

const now = new Date('2026-10-03T15:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

const result = (over: Partial<SourceResult<unknown>> = {}): SourceResult<unknown> => ({
  source: 'bma-flood',
  fetchedAt: ago(1),
  ok: true,
  items: [{ id: 'x' }],
  ...over,
});
const snap = (feeds: FeedMap): GroupSnapshot => ({ updatedAt: ago(1), feeds });

describe('relayFeed', () => {
  it('parses the flood fixture like the runner would', async () => {
    const r = await relayFeed('flood', floodRaw, now);
    if (!r.ok) throw new Error(r.error);
    expect(r.feed).toMatchObject({ source: 'bma-flood', ok: true, fetchedAt: now.toISOString() });
    expect(r.feed.items.length).toBe(6);
    expect(r.dropped).toBe(0);
  });

  it('parses the rain fixture', async () => {
    const r = await relayFeed('rain', rainRaw, now);
    if (!r.ok) throw new Error(r.error);
    expect(r.feed).toMatchObject({ source: 'bma-rain', ok: true, fetchedAt: now.toISOString() });
    expect(r.feed.items.length).toBe(3);
  });

  it('refuses anything but an array', async () => {
    for (const raw of [{}, 'x', null, 42]) {
      expect(await relayFeed('flood', raw, now)).toEqual({ ok: false, status: 400, error: 'expected a JSON array' });
    }
  });

  it('refuses an empty list so it cannot wipe good items', async () => {
    expect(await relayFeed('rain', [], now)).toEqual({ ok: false, status: 400, error: 'empty list' });
  });

  it('refuses more items than the runner allows', async () => {
    const many = Array.from({ length: 2001 }, () => floodRaw[0]);
    expect(await relayFeed('flood', many, now)).toEqual({ ok: false, status: 400, error: 'more than 2000 items' });
  });

  it('reports a parser crash without echoing it', async () => {
    // Missing names make the parser throw on .trim().
    expect(await relayFeed('flood', [{ flood_id: 1, latitude: 13.7, longitude: 100.5 }], now)).toEqual({
      ok: false,
      status: 400,
      error: 'unreadable BMA data',
    });
    expect(await relayFeed('rain', [{ rain_id: 1 }], now)).toMatchObject({ ok: false, error: 'unreadable BMA data' });
    expect(await relayFeed('flood', [null], now)).toMatchObject({ ok: false, error: 'unreadable BMA data' });
  });

  it('refuses a list with no usable points', async () => {
    // The flood parser skips points without coordinates, leaving nothing.
    expect(await relayFeed('flood', [{ flood_id: 1 }], now)).toEqual({ ok: false, status: 400, error: 'no usable items' });
  });

  it('refuses a list where most values are out of range', async () => {
    const forged = floodRaw.map((p, i) => (i < 4 ? { ...p, status: 1, flood: 9999 } : p));
    const r = await relayFeed('flood', forged, now);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it('drops a few bad rows but keeps the rest', async () => {
    const one = floodRaw.map((p, i) => (i === 0 ? { ...p, flood: 9999 } : p));
    const r = await relayFeed('flood', one, now);
    if (!r.ok) throw new Error(r.error);
    expect(r.feed.items.length).toBe(5);
    expect(r.dropped).toBe(1);
  });
});

describe('relayIsFresh', () => {
  it('is fresh under the limit and stale at it', () => {
    expect(relayIsFresh(snap({ flood: result({ fetchedAt: ago(40), lastOkAt: ago(9) }) }), 'flood', now, 10)).toBe(true);
    expect(relayIsFresh(snap({ flood: result({ fetchedAt: ago(40), lastOkAt: ago(10) }) }), 'flood', now, 10)).toBe(false);
  });

  it('falls back to fetchedAt', () => {
    expect(relayIsFresh(snap({ rain: result({ fetchedAt: ago(9) }) }), 'rain', now, 10)).toBe(true);
  });

  it('is never fresh for a failing, missing or absent feed', () => {
    expect(relayIsFresh(snap({ flood: result({ ok: false, lastOkAt: ago(1) }) }), 'flood', now, 10)).toBe(false);
    expect(relayIsFresh(snap({ flood: result() }), 'rain', now, 10)).toBe(false);
    expect(relayIsFresh(null, 'flood', now, 10)).toBe(false);
  });
});

describe('keepRecentRelay', () => {
  const failed = (source: 'bma-flood' | 'bma-rain' | 'thaiwater') => result({ source, ok: false, error: '403', items: [] });

  it('drops a failed runner flood/rain while the relayed copy is recent', () => {
    const prev = snap({ flood: result({ lastOkAt: ago(20) }), rain: result({ source: 'bma-rain', lastOkAt: ago(29) }) });
    const feeds: FeedMap = { flood: failed('bma-flood'), rain: failed('bma-rain'), waterlevel: failed('thaiwater') };
    const before = structuredClone(feeds);
    const r = keepRecentRelay(prev, feeds, now, 30);
    expect(r.kept).toEqual(['flood', 'rain']);
    expect(Object.keys(r.feeds)).toEqual(['waterlevel']);
    expect(r.feeds.waterlevel).toBe(feeds.waterlevel);
    expect(feeds).toEqual(before);
  });

  it('lets the failure through once the relay is too old', () => {
    const prev = snap({ flood: result({ lastOkAt: ago(31) }) });
    const r = keepRecentRelay(prev, { flood: failed('bma-flood') }, now, 30);
    expect(r.kept).toEqual([]);
    expect(r.feeds.flood?.ok).toBe(false);
  });

  it('uses the last good time of an already failing copy', () => {
    const prev = snap({ flood: result({ ok: false, fetchedAt: ago(1), lastOkAt: ago(20) }) });
    expect(keepRecentRelay(prev, { flood: failed('bma-flood') }, now, 30).kept).toEqual(['flood']);
    const never = snap({ flood: result({ ok: false, fetchedAt: ago(1) }) });
    expect(keepRecentRelay(never, { flood: failed('bma-flood') }, now, 30).kept).toEqual([]);
  });

  it('always keeps a good runner result and handles no previous snapshot', () => {
    const good = result({ fetchedAt: now.toISOString() });
    const r = keepRecentRelay(snap({ flood: result({ lastOkAt: ago(1) }) }), { flood: good }, now, 30);
    expect(r).toEqual({ feeds: { flood: good }, kept: [] });
    expect(keepRecentRelay(null, { flood: failed('bma-flood') }, now, 30).kept).toEqual([]);
  });
});
