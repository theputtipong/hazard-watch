// Uses the image libraries installed for apps/ingest.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../apps/ingest/package.json', import.meta.url));
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');
const { GifReader } = require('omggif');

/** GIF: last animation frame. */
export function decode(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) { const j = jpeg.decode(buf, { useTArray: true }); return { w: j.width, h: j.height, data: j.data }; }
  if (buf[0] === 0x89 && buf[1] === 0x50) { const p = PNG.sync.read(buf); return { w: p.width, h: p.height, data: p.data }; }
  if (buf[0] === 0x47 && buf[1] === 0x49) {
    const g = new GifReader(buf); const data = new Uint8Array(g.width * g.height * 4);
    for (let f = 0; f < g.numFrames(); f++) g.decodeAndBlitFrameRGBA(f, data);
    return { w: g.width, h: g.height, data };
  }
  throw new Error('unknown format');
}
export const load = (p) => decode(fs.readFileSync(p));
