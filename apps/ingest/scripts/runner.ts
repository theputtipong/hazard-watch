/**
 * Fetches the feeds that Cloudflare IPs are blocked from (BMA, ThaiWater) and pushes them
 * to the ingest worker. Runs on a schedule in GitHub Actions; can also be run locally:
 *   INGEST_URL=http://localhost:8787 INGEST_TOKEN=dev-token-change-me pnpm --filter @hw/ingest runner
 */
import { defaultContext, FEEDS, type RunnerFeed } from '@hw/sources';
import { RADARS, type RadarFrame } from '@hw/core';
import { echoesOnly, packBundle } from './radarImage';
import { INGEST } from '../src/config';

const base = process.env.INGEST_URL;
const token = process.env.INGEST_TOKEN;
if (!base || !token) throw new Error('INGEST_URL and INGEST_TOKEN are required');

const ctx = defaultContext();
const auth = { authorization: `Bearer ${token}` };

const entries = await Promise.all(
  (Object.entries(FEEDS.runner) as [RunnerFeed, (typeof FEEDS.runner)[RunnerFeed]][]).map(async ([name, run]) => [name, await run(ctx)] as const),
);
const feeds = Object.fromEntries(entries);
for (const [name, r] of entries) console.log(`${name.padEnd(10)} ${r.ok ? 'ok ' : 'ERR'} ${r.items.length} items ${r.error ?? ''}`);

// Radar images: every calibrated radar, cut to rain echoes, packed into one bundle (one KV write per run).
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
      // Lets the app say "no rain in range" instead of showing an empty layer without explanation.
      frame.echoPixels = out.echoPixels;
      items.push({ id: frame.radarId, time: frame.time, echoPixels: out.echoPixels, png: out.png });
      console.log(`radar ${frame.radarId.padEnd(10)} ${out.echoPixels} echo px`);
    } catch (err) {
      console.log(`radar ${frame.radarId}: ${err instanceof Error ? err.message : err}`);
    }
  }
  // Frames that could not be processed are not offered to the app.
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
