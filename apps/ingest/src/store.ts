import type { SourceResult } from '@hw/core';
import type { FeedName } from '@hw/sources';

/**
 * KV layout. Free plan allows 1,000 writes/day, so each run writes one key per group
 * (edge every 10 min = 144/day) plus the runner group and one radar bundle per runner run (~100/day at 30 min).
 */
export const KEYS = {
  edge: 'snapshot:edge',
  runner: 'snapshot:runner',
  /** All radar PNGs in one value (see scripts/radarImage.ts packBundle). */
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
 * Keeps the previous items of a feed that failed this run, so one bad fetch
 * doesn't blank the dashboard; the stale data is flagged by `ok: false`.
 * Also carries `lastOkAt` / `failingSince` forward so outages can be dated (tools/monitor);
 * this adds no KV writes, it rides on the one put per group.
 */
export function mergeWithPrevious(next: FeedMap, prev: GroupSnapshot | null): FeedMap {
  const out: FeedMap = { ...next };
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

/** Reads one radar's PNG out of the bundle without copying the others. */
export function unpackRadar(bundle: ArrayBuffer, id: string): { png: Uint8Array; entry: BundledRadar } | null {
  const view = new DataView(bundle);
  const headerLength = view.getUint32(0);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(bundle, 4, headerLength))) as { radars: BundledRadar[] };
  const entry = header.radars.find((r) => r.id === id);
  if (!entry) return null;
  return { png: new Uint8Array(bundle, 4 + headerLength + entry.offset, entry.length), entry };
}
