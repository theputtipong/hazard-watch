import type { SourceResult } from '@hw/core';
import type { FeedName } from '@hw/sources';

// KV free plan allows 1,000 writes/day: one put per group per run (edge 144/day, runner + radar bundle ~90/day).
export const KEYS = {
  edge: 'snapshot:edge',
  runner: 'snapshot:runner',
  radarBundle: 'radar:bundle',
} as const;

export type FeedMap = Partial<Record<FeedName, SourceResult<unknown>>>;

export interface GroupSnapshot {
  updatedAt: string;
  feeds: FeedMap;
  /** Runner group only: alerts from these feeds are not pushed before this time (set on a suspicious upload). */
  pushHeldUntil?: string;
}

export const isPushHeld = (snapshot: GroupSnapshot | null | undefined, now: Date) =>
  !!snapshot?.pushHeldUntil && Date.parse(snapshot.pushHeldUntil) > now.getTime();

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

/** `prev` skips the KV read when the caller already has it; a hold still in force carries over unless `holdPushUntil` replaces it. */
export async function writeGroup(
  kv: KVNamespace,
  key: string,
  feeds: FeedMap,
  now: Date,
  opts: { prev?: GroupSnapshot | null; holdPushUntil?: Date } = {},
): Promise<GroupSnapshot> {
  const prev = opts.prev !== undefined ? opts.prev : await readGroup(kv, key);
  const snapshot: GroupSnapshot = { updatedAt: now.toISOString(), feeds: mergeWithPrevious(feeds, prev) };
  if (opts.holdPushUntil) snapshot.pushHeldUntil = opts.holdPushUntil.toISOString();
  else if (isPushHeld(prev, now)) snapshot.pushHeldUntil = prev!.pushHeldUntil;
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

const isBundledRadar = (r: unknown, dataLength: number): r is BundledRadar => {
  if (!r || typeof r !== 'object') return false;
  const { id, time, echoPixels, offset, length } = r as Record<string, unknown>;
  return (
    typeof id === 'string' &&
    typeof time === 'string' &&
    typeof echoPixels === 'number' &&
    Number.isSafeInteger(offset) &&
    Number.isSafeInteger(length) &&
    (offset as number) >= 0 &&
    (length as number) > 0 &&
    (offset as number) + (length as number) <= dataLength
  );
};

/**
 * Layout: 4-byte big-endian header length, JSON header `{ radars }`, then the images back to back.
 * Returns null when the header itself is unreadable; entries that are malformed, out of range or overlap an
 * earlier image are dropped so one bad entry can't serve another radar's bytes.
 */
export function readRadarBundle(bundle: ArrayBuffer): { radars: BundledRadar[]; dropped: number; dataStart: number } | null {
  if (bundle.byteLength < 4) return null;
  const headerLength = new DataView(bundle).getUint32(0);
  const dataStart = 4 + headerLength;
  if (headerLength === 0 || dataStart > bundle.byteLength) return null;
  let raw: unknown;
  try {
    raw = (JSON.parse(new TextDecoder().decode(new Uint8Array(bundle, 4, headerLength))) as { radars?: unknown } | null)?.radars;
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  const dataLength = bundle.byteLength - dataStart;
  const inRange = raw.filter((r): r is BundledRadar => isBundledRadar(r, dataLength)).sort((a, b) => a.offset - b.offset);
  const radars: BundledRadar[] = [];
  let end = 0;
  for (const r of inRange) {
    if (r.offset < end) continue;
    radars.push(r);
    end = r.offset + r.length;
  }
  return { radars, dropped: raw.length - radars.length, dataStart };
}

export function unpackRadar(bundle: ArrayBuffer, id: string): { png: Uint8Array; entry: BundledRadar } | null {
  const parsed = readRadarBundle(bundle);
  const entry = parsed?.radars.find((r) => r.id === id);
  if (!parsed || !entry) return null;
  return { png: new Uint8Array(bundle, parsed.dataStart + entry.offset, entry.length), entry };
}
