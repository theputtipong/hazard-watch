import { RELAY_KINDS, type RelayKind, type SourceResult } from '@hw/core';
import { isPushHeld, KEYS, readGroup, type FeedMap, type GroupSnapshot } from './store';

// Relayed flood/rain live under their own keys (a whole-group write per relay let a slow flood upload wipe a
// rain relay sent at the same moment). Readers overlay them onto the runner group via readRunnerEffective.

export const RELAY_KEYS: Record<RelayKind, string> = { flood: KEYS.relayFlood, rain: KEYS.relayRain };

export interface RelayRecord {
  updatedAt: string;
  /** Always ok: only a successfully parsed relay is stored. */
  feed: SourceResult<unknown>;
  /** Set when this relay looked like a suspicious jump; holds runner-group pushes like the runner's own hold. */
  pushHeldUntil?: string;
}

export type RelayRecords = Partial<Record<RelayKind, RelayRecord>>;

export interface RunnerParts {
  runner: GroupSnapshot | null;
  relays: RelayRecords;
}

const time = (iso: string | undefined) => (iso ? Date.parse(iso) : -Infinity);
const later = (a: string | undefined, b: string | undefined) => (time(b) > time(a) ? b : a);

/**
 * The newer of the runner's copy and the relayed copy. A relay newer than the runner's last result (good, or the
 * start of its failure) wins; otherwise the runner's copy stands, a failing one still dated by the relay's last good time.
 */
export function overlayFeed(runner: SourceResult<unknown> | undefined, relay: SourceResult<unknown> | undefined): SourceResult<unknown> | undefined {
  if (!relay) return runner;
  const relayed: SourceResult<unknown> = { ...relay, lastOkAt: relay.lastOkAt ?? relay.fetchedAt };
  if (!runner) return relayed;
  const runnerAt = runner.ok ? runner.fetchedAt : (runner.failingSince ?? runner.fetchedAt);
  if (time(relay.fetchedAt) >= time(runnerAt)) return relayed;
  if (runner.ok) return runner;
  if (time(relay.fetchedAt) <= time(runner.lastOkAt)) return runner;
  // Failing since after the relay: keep the failure, but show the relay's items and date it by the relay.
  return { ...runner, items: relay.items, fetchedAt: relay.fetchedAt, lastOkAt: relay.fetchedAt };
}

/** The runner group as every reader should see it: relayed flood/rain overlaid, any push hold in force kept. */
export function overlayRelays(runner: GroupSnapshot | null, relays: RelayRecords): GroupSnapshot | null {
  const records = RELAY_KINDS.flatMap((k) => (relays[k] ? [[k, relays[k]] as const] : []));
  if (!records.length) return runner;
  const out: GroupSnapshot = { updatedAt: runner?.updatedAt ?? records[0]![1].updatedAt, feeds: { ...(runner?.feeds ?? {}) } };
  let hold = runner?.pushHeldUntil;
  for (const [kind, rec] of records) {
    out.feeds[kind] = overlayFeed(out.feeds[kind], rec.feed);
    out.updatedAt = later(out.updatedAt, rec.updatedAt)!;
    hold = later(hold, rec.pushHeldUntil);
  }
  if (hold) out.pushHeldUntil = hold;
  return out;
}

/**
 * What a runner upload of `next` merges onto: its own group, except that flood/rain it is uploading start from the
 * effective (relay-overlaid) copy, so a failure after a relay starts a new streak dated now, with the relay's items
 * and last good time, instead of resuming a runner streak older than the relay. The relay's push hold stays on its key.
 */
export function runnerWriteBase({ runner, relays }: RunnerParts, next: FeedMap): GroupSnapshot | null {
  const kinds = RELAY_KINDS.filter((k) => next[k] && relays[k]);
  if (!kinds.length) return runner;
  const feeds: FeedMap = { ...(runner?.feeds ?? {}) };
  for (const k of kinds) feeds[k] = overlayFeed(feeds[k], relays[k]!.feed);
  return { ...(runner ?? { updatedAt: relays[kinds[0]!]!.updatedAt }), feeds };
}

export async function readRunnerParts(kv: KVNamespace): Promise<RunnerParts> {
  const [runner, ...records] = await Promise.all([
    readGroup(kv, KEYS.runner),
    ...RELAY_KINDS.map((k) => kv.get<RelayRecord>(RELAY_KEYS[k], 'json')),
  ]);
  const relays: RelayRecords = {};
  RELAY_KINDS.forEach((k, i) => {
    if (records[i]?.feed) relays[k] = records[i]!;
  });
  return { runner, relays };
}

/** Use this, not a raw KEYS.runner read, wherever the runner group is shown, pushed or compared against. */
export async function readRunnerEffective(kv: KVNamespace): Promise<GroupSnapshot | null> {
  const { runner, relays } = await readRunnerParts(kv);
  return overlayRelays(runner, relays);
}

/** One KV put: this kind's own key only. A hold still in force on the previous record carries over. */
export async function writeRelay(
  kv: KVNamespace,
  kind: RelayKind,
  feed: SourceResult<unknown>,
  now: Date,
  opts: { prev?: RelayRecord; holdPushUntil?: Date } = {},
): Promise<RelayRecord> {
  const { failingSince: _drop, ...rest } = feed;
  const record: RelayRecord = { updatedAt: now.toISOString(), feed: { ...rest, lastOkAt: feed.fetchedAt } };
  if (opts.holdPushUntil) record.pushHeldUntil = opts.holdPushUntil.toISOString();
  else if (isPushHeld(opts.prev, now)) record.pushHeldUntil = opts.prev!.pushHeldUntil;
  await kv.put(RELAY_KEYS[kind], JSON.stringify(record));
  return record;
}
