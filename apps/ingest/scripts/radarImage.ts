import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import type { RadarSpec } from '@hw/core';

/**
 * Turns a radar JPEG (rain echoes drawn over a base map) into a PNG that contains only the echoes,
 * so it can sit on top of our own map. Echo colours on these images are strongly saturated greens,
 * yellows, reds and purples; the base map is grey, the sea and rivers are blue, labels are black/white.
 */
export function echoesOnly(jpg: Uint8Array, spec: RadarSpec): Buffer {
  const img = jpeg.decode(jpg, { useTArray: true });
  if (img.width !== spec.size[0] || img.height !== spec.size[1]) {
    throw new Error(`${spec.id}: image is ${img.width}x${img.height}, expected ${spec.size.join('x')} — re-fit bounds`);
  }
  const png = new PNG({ width: img.width, height: img.height });
  const inIgnored = (x: number, y: number) => spec.ignore.some(([rx, ry, rw, rh]) => x >= rx && x < rx + rw && y >= ry && y < ry + rh);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      const r = img.data[i]!, g = img.data[i + 1]!, b = img.data[i + 2]!;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const saturated = max - min > 70 && max > 90;
      const blue = b >= r && b >= g; // sea, rivers and the weakest (<10 dBZ) echoes
      const keep = saturated && !blue && !inIgnored(x, y);
      // Zero hidden pixels so the PNG compresses to a few KB instead of ~1 MB.
      png.data[i] = keep ? r : 0;
      png.data[i + 1] = keep ? g : 0;
      png.data[i + 2] = keep ? b : 0;
      png.data[i + 3] = keep ? 255 : 0;
    }
  }
  return PNG.sync.write(png);
}
