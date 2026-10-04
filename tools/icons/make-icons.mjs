// Draws the app icon (white cloud with blue rain on navy) at the sizes browsers and phones need.
// Usage (needs pngjs, installed in apps/ingest): node tools/icons/make-icons.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../apps/ingest/package.json', import.meta.url));
const { PNG } = require('pngjs');

const NAVY = [15, 27, 45], WHITE = [255, 255, 255], RAIN = [127, 178, 255];

/** Signed distance helpers in a 0..1 square. */
const circle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
const roundRect = (x, y, x0, y0, x1, y1, r) => {
  const qx = Math.max(x0 + r - x, 0, x - (x1 - r)), qy = Math.max(y0 + r - y, 0, y - (y1 - r));
  const outside = Math.hypot(qx, qy) - r;
  const inside = Math.min(Math.max(x0 - x, x - x1, y0 - y, y - y1), 0);
  return qx > 0 || qy > 0 ? outside : inside;
};
const segment = (x, y, ax, ay, bx, by, r) => {
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))) - r;
};

function draw(size, { padding = 0, rounded = true } = {}) {
  const png = new PNG({ width: size, height: size });
  const s = (v) => padding + v * (1 - 2 * padding); // shrink artwork for maskable icons
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) / size, y = (py + 0.5) / size;
      const aa = 1 / size;
      const bg = rounded ? roundRect(x, y, 0, 0, 1, 1, 0.22) : -1;
      const cloud = Math.min(
        circle(x, y, s(0.38), s(0.47), 0.15 * (1 - 2 * padding)),
        circle(x, y, s(0.56), s(0.4), 0.19 * (1 - 2 * padding)),
        circle(x, y, s(0.7), s(0.5), 0.12 * (1 - 2 * padding)),
        roundRect(x, y, s(0.26), s(0.47), s(0.8), s(0.62), 0.07 * (1 - 2 * padding)),
      );
      const rain = Math.min(
        ...[0.38, 0.53, 0.68].map((cx) => segment(x, y, s(cx), s(0.7), s(cx - 0.05), s(0.84), 0.028 * (1 - 2 * padding))),
      );
      const cover = (d) => Math.max(0, Math.min(1, 0.5 - d / aa));
      let c = NAVY, a = cover(bg);
      const mix = (col, k) => (c = c.map((v, i) => v + (col[i] - v) * k));
      mix(RAIN, cover(rain));
      mix(WHITE, cover(cloud));
      const i = (py * size + px) * 4;
      png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = Math.round(255 * a);
    }
  }
  return PNG.sync.write(png);
}

const out = new URL('../../apps/web/public/icons/', import.meta.url);
fs.writeFileSync(new URL('icon-192.png', out), draw(192));
fs.writeFileSync(new URL('icon-512.png', out), draw(512));
// Maskable: full-bleed background, artwork inside the 80% safe zone.
fs.writeFileSync(new URL('icon-maskable-512.png', out), draw(512, { padding: 0.1, rounded: false }));
fs.writeFileSync(new URL('../../apps/web/src/app/icon.png', import.meta.url), draw(64));
fs.writeFileSync(new URL('../../apps/web/src/app/apple-icon.png', import.meta.url), draw(180, { rounded: false }));
console.log('icons written');
