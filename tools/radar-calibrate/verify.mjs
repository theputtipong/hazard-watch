// Draws real province borders (geoBoundaries ADM1) in red onto a radar image using given bounds, to eyeball a fit.
// Usage: node verify.mjs <image> <south,west,north,east> <out.png>
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { load } from './decode.mjs';
const require = createRequire(new URL('../../apps/ingest/package.json', import.meta.url));
const { PNG } = require('pngjs');
const [file, b, out] = process.argv.slice(2);
const [s, wst, n, e] = b.split(',').map(Number);
const img = load(file);
const png = new PNG({ width: img.w, height: img.h });
png.data.set(img.data);
const gj = JSON.parse(fs.readFileSync(new URL('../boundaries/.cache/gb_adm1.geojson', import.meta.url), 'utf8'));
const put = (x, y) => { if (x < 0 || y < 0 || x >= img.w || y >= img.h) return; const i = (y * img.w + x) * 4; png.data[i] = 255; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 255; };
for (const f of gj.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) for (const ring of poly) for (let i = 1; i < ring.length; i++) {
    const [x1, y1] = ring[i - 1], [x2, y2] = ring[i];
    const steps = 20;
    for (let k = 0; k <= steps; k++) {
      const lon = x1 + ((x2 - x1) * k) / steps, lat = y1 + ((y2 - y1) * k) / steps;
      put(Math.round(((lon - wst) / (e - wst)) * img.w), Math.round(((n - lat) / (n - s)) * img.h));
    }
  }
}
fs.writeFileSync(out, PNG.sync.write(png));
