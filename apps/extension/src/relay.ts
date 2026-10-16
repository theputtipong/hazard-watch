import { needsRelay, RELAY_KINDS, type DashboardSnapshot, type RelayKind } from '@hw/core';
import { fetchBma, relayBma } from './api';

export interface RelayDeps {
  fetchBma(kind: RelayKind): Promise<unknown>;
  relayBma(kind: RelayKind, raw: unknown): Promise<void>;
}

/**
 * For each kind with needsRelay(snapshot.runner?.feeds[kind], now): fetch BMA, skip non-arrays, relay.
 * Never throws: relaying is a best-effort side job of the alarm. Returns the kinds relayed.
 */
export async function relayStale(
  snapshot: DashboardSnapshot,
  now: Date,
  deps: RelayDeps = { fetchBma, relayBma },
): Promise<RelayKind[]> {
  const done = await Promise.all(
    RELAY_KINDS.map(async (kind) => {
      if (!needsRelay(snapshot.runner?.feeds?.[kind], now)) return null;
      try {
        const raw = await deps.fetchBma(kind);
        // BMA answers errors with HTML or objects; the server would 400 them anyway.
        if (!Array.isArray(raw)) return null;
        await deps.relayBma(kind, raw);
        return kind;
      } catch {
        // One kind failing (offline, BMA down, server 4xx) must not block the other.
        return null;
      }
    }),
  );
  return done.filter((k): k is RelayKind => k !== null);
}
