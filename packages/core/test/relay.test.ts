import { describe, expect, it } from 'vitest';
import { BMA_URLS, isRelayKind, needsRelay, RELAY_FRESH_MINUTES, relayPath, type SourceResult } from '../src';

const now = new Date('2026-10-16T10:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
const feed = (over: Partial<SourceResult<unknown>> = {}): SourceResult<unknown> => ({
  source: 'bma-flood',
  fetchedAt: ago(1),
  ok: true,
  items: [],
  ...over,
});

describe('needsRelay', () => {
  it('relays a missing feed', () => {
    expect(needsRelay(undefined, now)).toBe(true);
    expect(needsRelay(null, now)).toBe(true);
  });

  it('relays a failing feed even if its last good copy is recent', () => {
    expect(needsRelay(feed({ ok: false, lastOkAt: ago(1) }), now)).toBe(true);
  });

  it('skips while the last good fetch is under 10 minutes old', () => {
    expect(RELAY_FRESH_MINUTES).toBe(10);
    expect(needsRelay(feed({ fetchedAt: ago(30), lastOkAt: ago(9) }), now)).toBe(false);
    expect(needsRelay(feed({ fetchedAt: ago(30), lastOkAt: ago(10) }), now)).toBe(true);
  });

  it('falls back to fetchedAt without lastOkAt', () => {
    expect(needsRelay(feed({ fetchedAt: ago(9) }), now)).toBe(false);
    expect(needsRelay(feed({ fetchedAt: ago(10) }), now)).toBe(true);
  });

  it('relays when the date is unreadable', () => {
    expect(needsRelay(feed({ fetchedAt: 'nope' }), now)).toBe(true);
  });
});

describe('relay constants', () => {
  it('builds the API path', () => {
    expect(relayPath('rain')).toBe('/v1/relay/bma/rain');
    expect(relayPath('flood')).toBe('/v1/relay/bma/flood');
  });

  it('only knows flood and rain', () => {
    expect(isRelayKind('flood')).toBe(true);
    expect(isRelayKind('rain')).toBe(true);
    expect(isRelayKind('waterlevel')).toBe(false);
    expect(Object.keys(BMA_URLS).sort()).toEqual(['flood', 'rain']);
  });
});
