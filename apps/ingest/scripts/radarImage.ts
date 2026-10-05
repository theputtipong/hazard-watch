import jpeg from 'jpeg-js';
import { GifReader } from 'omggif';
import { PNG } from 'pngjs';
import type { RadarSpec } from '@hw/core';

interface Rgba {
  width: number;
  height: number;
  data: Uint8Array;
}

/** JPEG (BMA, TMD), PNG (DRRAA) or GIF (some TMD; the last frame of an animation is the newest). */
export function decodeImage(buf: Uint8Array): Rgba {
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const j = jpeg.decode(buf, { useTArray: true });
    return { width: j.width, height: j.height, data: j.data };
  }
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    const p = PNG.sync.read(Buffer.from(buf));
    return { width: p.width, height: p.height, data: new Uint8Array(p.data) };
  }
  if (buf[0] === 0x47 && buf[1] === 0x49) {
    const g = new GifReader(Buffer.from(buf));
    const data = new Uint8Array(g.width * g.height * 4);
    for (let f = 0; f < g.numFrames(); f++) g.decodeAndBlitFrameRGBA(f, data);
    return { width: g.width, height: g.height, data };
  }
  throw new Error('unsupported image format');
}

/**
 * Turns a radar image (rain echoes drawn over a base map) into a PNG holding only the echoes, so it can sit
 * on our own map. How echoes are told apart from the base map depends on the source (see RadarSpec.echo).
 */
export function echoesOnly(buf: Uint8Array, spec: RadarSpec): { png: Buffer; echoPixels: number } {
  const img = decodeImage(buf);
  const { width: w, height: h, data } = img;
  if (w !== spec.size[0] || h !== spec.size[1]) {
    throw new Error(`${spec.id}: image is ${w}x${h}, expected ${spec.size.join('x')} — re-fit bounds`);
  }
  const rule = spec.echo;
  const palette = rule.kind === 'palette' ? new Set(rule.colors.map(([r, g, b]) => (r << 16) | (g << 8) | b)) : null;
  const ignored = (x: number, y: number) => spec.ignore.some(([rx, ry, rw, rh]) => x >= rx && x < rx + rw && y >= ry && y < ry + rh);

  const candidate = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
      let echo: boolean;
      if (palette) {
        echo = palette.has((r << 16) | (g << 8) | b);
      } else {
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        // Saturated, bright, not blue (sea, rivers and the weakest echoes are blue on these images).
        echo = max - min >= (rule.kind === 'saturation' ? rule.minChroma : 70) && max > 90 && !(b >= r && b >= g);
      }
      if (echo && !ignored(x, y)) candidate[y * w + x] = 1;
    }
  }

  // Optional despeckle: drop pixels with few echo neighbours (thin range rings, labels, JPEG noise).
  const need = rule.minNeighbours ?? 0;
  const png = new PNG({ width: w, height: h });
  let echoPixels = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      let keep = candidate[k] === 1;
      if (keep && need) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && y + dy >= 0 && y + dy < h && x + dx >= 0 && x + dx < w) n += candidate[k + dy * w + dx]!;
        keep = n >= need;
      }
      const i = k * 4;
      // Hidden pixels are zeroed so the PNG compresses to a few KB.
      png.data[i] = keep ? data[i]! : 0;
      png.data[i + 1] = keep ? data[i + 1]! : 0;
      png.data[i + 2] = keep ? data[i + 2]! : 0;
      png.data[i + 3] = keep ? 255 : 0;
      if (keep) echoPixels++;
    }
  }
  return { png: PNG.sync.write(png), echoPixels };
}

/**
 * Packs many PNGs into one upload (and one KV write): [u32 header length][header JSON][PNG bytes…].
 * Keeps the free KV write quota safe however many radars there are.
 */
export function packBundle(items: { id: string; time: string; echoPixels: number; png: Buffer }[]): Buffer {
  let offset = 0;
  const radars = items.map((it) => {
    const entry = { id: it.id, time: it.time, echoPixels: it.echoPixels, offset, length: it.png.length };
    offset += it.png.length;
    return entry;
  });
  const header = Buffer.from(JSON.stringify({ radars }));
  const len = Buffer.alloc(4);
  len.writeUInt32BE(header.length);
  return Buffer.concat([len, header, ...items.map((it) => it.png)]);
}
