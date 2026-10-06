import type { SourceResult } from '@hw/core';
import type { FeedName } from '@hw/sources';

// KV free plan allows 1,000 writes/day: one put per group per run (edge 144/day, runner + radar bundle ~100/day).
export const KEYS = {
  edge: 'snapshot:edge',
  runner: 'snapshot:runner',
  radarBundle: 'radar:bundle',
} as const;

export type FeedMap = Partial<Record<FeedName, SourceResult<unknown>>>;

export interface GroupSnapshot {
  updatedAt: string;
  feeds: FeedMap;
}

export async function readGroup(kv: KVNamespace, key: string): Promise<GroupSnapshot | null> {
  return kv.get<GroupSnapshot>(key, 'json');
}

/**
 * Failed or skipped feeds keep their previous items (flagged `ok: false`) so one bad fetch doesn't blank the dashboard;
 * `lastOkAt` / `failingSince` let tools/monitor date outages without extra KV writes.
 */
export function mergeWithPrevious(next: FeedMap, prev: GroupSnapshot | null): FeedMap {
  const out: FeedMap = { ...(prev?.feeds ?? {}), ...next };
  for (const [name, result] of Object.entries(next) as [FeedName, SourceResult<unknown>][]) {
    const old = prev?.feeds[name];
    if (result.ok) {
      const { failingSince: _drop, ...rest } = result;
      out[name] = { ...rest, lastOkAt: result.fetchedAt };
      continue;
    }
    const lastOkAt = old?.lastOkAt ?? (old?.ok ? old.fetchedAt : undefined);
    const failingSince = (old && !old.ok && old.failingSince) || result.fetchedAt;
    const merged = old && old.items.length ? { ...result, items: old.items, fetchedAt: old.fetchedAt } : { ...result };
    out[name] = { ...merged, failingSince, ...(lastOkAt ? { lastOkAt } : {}) };
  }
  return out;
}

export async function writeGroup(kv: KVNamespace, key: string, feeds: FeedMap, now: Date): Promise<GroupSnapshot> {
  const prev = await readGroup(kv, key);
  const snapshot: GroupSnapshot = { updatedAt: now.toISOString(), feeds: mergeWithPrevious(feeds, prev) };
  await kv.put(key, JSON.stringify(snapshot));
  return snapshot;
}

export interface BundledRadar {
  id: string;
  time: string;
  echoPixels: number;
  offset: number;
  length: number;
}

export function unpackRadar(bundle: ArrayBuffer, id: string): { png: Uint8Array; entry: BundledRadar } | null {
  const view = new DataView(bundle);
  const headerLength = view.getUint32(0);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(bundle, 4, headerLength))) as { radars: BundledRadar[] };
  const entry = header.radars.find((r) => r.id === id);
  if (!entry) return null;
  return { png: new Uint8Array(bundle, 4 + headerLength + entry.offset, entry.length), entry };
}
