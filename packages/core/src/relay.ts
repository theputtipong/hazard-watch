import type { SourceResult } from './types';

// Phones and the extension on Thai IPs relay BMA flood/rain to the API, because BMA blocks cloud IPs.

/** Single source for the relay cadence: ingest config and the extension; mobile keeps DeviceBma.maxAge = 10 min. */
export const RELAY_FRESH_MINUTES = 10;

export const RELAY_KINDS = ['flood', 'rain'] as const;
export type RelayKind = (typeof RELAY_KINDS)[number];

export const isRelayKind = (k: string): k is RelayKind => (RELAY_KINDS as readonly string[]).includes(k);

/** Unofficial POST-only BMA endpoints; blocked from cloud IPs. */
export const BMA_URLS: Record<RelayKind, string> = {
  flood: 'https://weather.bangkok.go.th/Flood/PageMap/GetDataTable',
  rain: 'https://weather.bangkok.go.th/rain/PageMap/GetDataForUpdate',
};

export const relayPath = (kind: RelayKind) => `/v1/relay/bma/${kind}`;

/** Missing, failing, or last good fetch ≥ RELAY_FRESH_MINUTES ago (the server treats younger copies as fresh). */
export function needsRelay(feed: SourceResult<unknown> | undefined | null, now: Date): boolean {
  if (!feed || !feed.ok) return true;
  const lastOk = feed.lastOkAt ?? feed.fetchedAt;
  if (!lastOk) return true;
  const ms = Date.parse(lastOk);
  // An unparsable date can't prove freshness, so relay.
  return !Number.isFinite(ms) || now.getTime() - ms >= RELAY_FRESH_MINUTES * 60_000;
}
