/**
 * Fetches the feeds that Cloudflare IPs are blocked from (BMA, ThaiWater) and pushes them
 * to the ingest worker. Runs on a schedule in GitHub Actions; can also be run locally:
 *   INGEST_URL=http://localhost:8787 INGEST_TOKEN=dev-token-change-me pnpm --filter @hw/ingest runner
 */
import { defaultContext, FEEDS, type RunnerFeed } from '@hw/sources';
import { RADARS, regionRadars } from '@hw/core';
import { echoesOnly } from './radarImage';
import { INGEST } from '../src/config';

const base = process.env.INGEST_URL;
const token = process.env.INGEST_TOKEN;
if (!base || !token) throw new Error('INGEST_URL and INGEST_TOKEN are required');

const ctx = defaultContext();
const radarIds = regionRadars(ctx.regions);
const auth = { authorization: `Bearer ${token}` };

const entries = await Promise.all(
  (Object.entries(FEEDS.runner) as [RunnerFeed, (typeof FEEDS.runner)[RunnerFeed]][]).map(async ([name, run]) => [name, await run(ctx)] as const),
);
const feeds = Object.fromEntries(entries);
for (const [name, r] of entries) console.log(`${name.padEnd(10)} ${r.ok ? 'ok ' : 'ERR'} ${r.items.length} items ${r.error ?? ''}`);

// Radar images: download the latest frame of each radar in the active regions and store it at the edge.
const radar = feeds.radar;
if (radar?.ok) {
  for (const frame of radar.items as { radarId: string; time: string; imageUrl: string; echoPixels?: number }[]) {
    if (!radarIds.includes(frame.radarId)) continue;
    const img = await fetch(frame.imageUrl, { signal: AbortSignal.timeout(INGEST.radarDownloadTimeoutMs) });
    if (!img.ok) {
      console.log(`radar ${frame.radarId}: download failed ${img.status}`);
      continue;
    }
    const spec = RADARS[frame.radarId];
    if (!spec) {
      console.log(`radar ${frame.radarId}: no calibration in core/radars.ts, skipped`);
      continue;
    }
    let png: Buffer;
    try {
      const out = echoesOnly(new Uint8Array(await img.arrayBuffer()), spec);
      png = out.png;
      // Lets the app say "no rain in range" instead of showing an empty layer without explanation.
      frame.echoPixels = out.echoPixels;
    } catch (err) {
      console.log(`radar ${frame.radarId}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    const put = await fetch(`${base}/ingest/radar/${frame.radarId}?time=${encodeURIComponent(frame.time)}`, {
      method: 'PUT',
      headers: { ...auth, 'content-type': 'image/png' },
      body: png,
    });
    console.log(`radar ${frame.radarId}: ${put.status} (${frame.echoPixels} echo px)`);
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
