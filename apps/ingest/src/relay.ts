import { RELAY_KINDS, type RelayKind, type SourceResult } from '@hw/core';
import { defaultContext, parseBmaFlood, parseBmaRain, settle } from '@hw/sources';
import type { FeedMap, GroupSnapshot } from './store';
import { parseRunnerPayload, RUNNER_SPEC } from './validate';

// Phones and the extension on Thai IPs send the raw BMA list, which anyone could forge: re-parse it with the
// runner's own parser and limits so a relay can never write anything a runner upload couldn't.

export type RelayResult = { ok: true; feed: SourceResult<unknown>; dropped: number } | { ok: false; status: 400; error: string };

const bad = (error: string): RelayResult => ({ ok: false, status: 400, error });

/** Turns a raw BMA array into a checked runner feed. Async because `settle` is. */
export async function relayFeed(kind: RelayKind, raw: unknown, now: Date): Promise<RelayResult> {
  if (!Array.isArray(raw)) return bad('expected a JSON array');
  // An empty upload would wipe good items; BMA never sends [] when healthy.
  if (raw.length === 0) return bad('empty list');
  const max = RUNNER_SPEC[kind].maxItems;
  if (raw.length > max) return bad(`more than ${max} items`);

  const ctx = defaultContext({ now });
  const result =
    kind === 'flood'
      ? await settle('bma-flood', ctx, async () => parseBmaFlood(raw as Parameters<typeof parseBmaFlood>[0], ctx))
      : await settle('bma-rain', ctx, async () => parseBmaRain(raw as Parameters<typeof parseBmaRain>[0], ctx));
  // Don't echo the exception: it would reflect attacker-shaped text back.
  if (!result.ok) return bad('unreadable BMA data');

  const parsed = parseRunnerPayload({ feeds: { [kind]: result } }, now);
  if (!parsed.ok) return bad(parsed.error);
  const feed = parsed.feeds[kind];
  if (!feed) return bad(`${kind} dropped: too many invalid items`);
  if (feed.items.length === 0) return bad('no usable items');
  return { ok: true, feed, dropped: parsed.dropped.length };
}

/** The stored copy of this feed is good and younger than `minutes`, so a relay would only burn a KV write. */
export function relayIsFresh(prev: GroupSnapshot | null, kind: RelayKind, now: Date, minutes: number): boolean {
  const f = prev?.feeds[kind];
  if (!f?.ok) return false;
  return now.getTime() - Date.parse(f.lastOkAt ?? f.fetchedAt) < minutes * 60_000;
}

/**
 * The runner can't reach BMA from cloud IPs, so its flood/rain usually fail; drop those failures while a relayed
 * copy is recent, so the store keeps it as ok instead of marking the feed failing. A runner `ok: true` always wins.
 */
export function keepRecentRelay(prev: GroupSnapshot | null, feeds: FeedMap, now: Date, minutes: number): { feeds: FeedMap; kept: RelayKind[] } {
  const out: FeedMap = { ...feeds };
  const kept: RelayKind[] = [];
  for (const kind of RELAY_KINDS) {
    const next = feeds[kind];
    const p = prev?.feeds[kind];
    if (!next || next.ok || !p) continue;
    const lastOk = p.lastOkAt ?? (p.ok ? p.fetchedAt : undefined);
    if (!lastOk || !(now.getTime() - Date.parse(lastOk) < minutes * 60_000)) continue;
    delete out[kind];
    kept.push(kind);
  }
  return { feeds: out, kept };
}
