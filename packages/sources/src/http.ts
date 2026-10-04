import { activeRegions, DEFAULT_CONFIG, type AlertConfig, type Region, type SourceId, type SourceResult } from '@hw/core';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface AdapterContext {
  fetch: FetchLike;
  config: AlertConfig;
  /** Coverage areas; adapters drop data outside them. */
  regions: Region[];
  now: Date;
}

export function defaultContext(partial: Partial<AdapterContext> = {}): AdapterContext {
  return { fetch: globalThis.fetch.bind(globalThis), config: DEFAULT_CONFIG, regions: activeRegions(), now: new Date(), ...partial };
}

const USER_AGENT = 'hazard-watch/0.1 (public non-commercial dashboard)';
const TIMEOUT_MS = 30_000;

async function request(ctx: AdapterContext, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await ctx.fetch(url, {
    ...init,
    headers: { 'user-agent': USER_AGENT, accept: 'application/json, text/xml;q=0.9, */*;q=0.8', ...init.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
  return res;
}

export async function getJson<T>(ctx: AdapterContext, url: string, init?: RequestInit): Promise<T> {
  const res = await request(ctx, url, init);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Non-JSON response from ${new URL(url).host}: ${text.slice(0, 80)}`);
  }
}

export async function getText(ctx: AdapterContext, url: string, init?: RequestInit): Promise<string> {
  return (await request(ctx, url, init)).text();
}

/** Wraps an adapter run so one failing source never breaks the others. */
export async function settle<T>(source: SourceId, ctx: AdapterContext, run: () => Promise<T[]>): Promise<SourceResult<T>> {
  const fetchedAt = ctx.now.toISOString();
  try {
    return { source, fetchedAt, ok: true, items: await run() };
  } catch (err) {
    return { source, fetchedAt, ok: false, error: err instanceof Error ? err.message : String(err), items: [] };
  }
}
