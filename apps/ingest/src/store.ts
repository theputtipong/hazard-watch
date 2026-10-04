import type { SourceResult } from '@hw/core';
import type { FeedName } from '@hw/sources';

/**
 * KV layout. Free plan allows 1,000 writes/day, so each run writes one key per group
 * (edge every 10 min = 144/day) plus runner groups and radar images (~200/day at 30 min).
 */
export const KEYS = {
  edge: 'snapshot:edge',
  runner: 'snapshot:runner',
  radar: (id: string) => `radar:${id}`,
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
 * Keeps the previous items of a feed that failed this run, so one bad fetch
 * doesn't blank the dashboard; the stale data is flagged by `ok: false`.
 */
export function mergeWithPrevious(next: FeedMap, prev: GroupSnapshot | null): FeedMap {
  const out: FeedMap = { ...next };
  for (const [name, result] of Object.entries(next) as [FeedName, SourceResult<unknown>][]) {
    const old = prev?.feeds[name];
    if (!result.ok && old && old.items.length) {
      out[name] = { ...result, items: old.items, fetchedAt: old.fetchedAt };
    }
  }
  return out;
}

export async function writeGroup(kv: KVNamespace, key: string, feeds: FeedMap, now: Date): Promise<GroupSnapshot> {
  const prev = await readGroup(kv, key);
  const snapshot: GroupSnapshot = { updatedAt: now.toISOString(), feeds: mergeWithPrevious(feeds, prev) };
  await kv.put(key, JSON.stringify(snapshot));
  return snapshot;
}
