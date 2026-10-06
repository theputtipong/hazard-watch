// Runs outside Cloudflare because BMA and ThaiWater block Cloudflare IPs; uploads the feeds to the ingest worker.
import { defaultContext, FEEDS, type RunnerFeed } from '@hw/sources';
import { RADARS, type RadarFrame } from '@hw/core';
import { echoesOnly, packBundle } from './radarImage';
import { INGEST } from '../src/config';

const base = process.env.INGEST_URL;
const token = process.env.INGEST_TOKEN;
if (!base || !token) throw new Error('INGEST_URL and INGEST_TOKEN are required');

const ctx = defaultContext();
const auth = { authorization: `Bearer ${token}` };

async function recentlyFetched(): Promise<Set<string>> {
  const skip = new Set<string>();
  try {
    const res = await fetch(`${base}/v1/snapshot`);
    const prev = res.ok ? ((await res.json()) as { runner?: { feeds?: Record<string, { ok: boolean; fetchedAt: string; lastOkAt?: string }> } }).runner?.feeds : undefined;
    for (const [name, hours] of Object.entries(INGEST.runnerFeedEveryHours)) {
      const last = prev?.[name]?.ok ? (prev[name]!.lastOkAt ?? prev[name]!.fetchedAt) : undefined;
      if (hours && last && Date.now() - new Date(last).getTime() < hours * 3_600_000) skip.add(name);
    }
  } catch {
    // Snapshot unreadable: fetch everything.
  }
  return skip;
}

const skip = await recentlyFetched();
for (const name of skip) console.log(`${name.padEnd(10)} skip (fetched within ${INGEST.runnerFeedEveryHours[name as RunnerFeed]} h)`);
const entries = await Promise.all(
  (Object.entries(FEEDS.runner) as [RunnerFeed, (typeof FEEDS.runner)[RunnerFeed]][])
    .filter(([name]) => !skip.has(name))
    .map(async ([name, run]) => [name, await run(ctx)] as const),
);
const feeds = Object.fromEntries(entries);
for (const [name, r] of entries) console.log(`${name.padEnd(10)} ${r.ok ? 'ok ' : 'ERR'} ${r.items.length} items ${r.error ?? ''}`);

const radar = feeds.radar;
if (radar?.ok) {
  const items: { id: string; time: string; echoPixels: number; png: Buffer }[] = [];
  for (const frame of radar.items as RadarFrame[]) {
    const spec = RADARS[frame.radarId];
    if (!spec) continue;
    try {
      const img = await fetch(frame.imageUrl, { signal: AbortSignal.timeout(INGEST.radarDownloadTimeoutMs) });
      if (!img.ok) throw new Error(`download failed ${img.status}`);
      const out = echoesOnly(new Uint8Array(await img.arrayBuffer()), spec);
      // Lets the app say "no rain in range" instead of showing an unexplained empty layer.
      frame.echoPixels = out.echoPixels;
      items.push({ id: frame.radarId, time: frame.time, echoPixels: out.echoPixels, png: out.png });
      console.log(`radar ${frame.radarId.padEnd(10)} ${out.echoPixels} echo px`);
    } catch (err) {
      console.log(`radar ${frame.radarId}: ${err instanceof Error ? err.message : err}`);
    }
  }
  radar.items = (radar.items as RadarFrame[]).filter((f) => items.some((it) => it.id === f.radarId));
  if (items.length) {
    const put = await fetch(`${base}/ingest/radar-bundle`, {
      method: 'PUT',
      headers: { ...auth, 'content-type': 'application/octet-stream' },
      body: packBundle(items),
    });
    console.log(`radar bundle: ${put.status} (${items.length} radars)`);
  }
}

const res = await fetch(`${base}/ingest/runner`, {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json' },
  body: JSON.stringify({ feeds }),
});
console.log('upload snapshot:', res.status, await res.text());

const failed = entries.filter(([, r]) => !r.ok).length;
if (failed === entries.length) process.exit(1);
