import { load } from './decode.mjs';
// Find the centre whose 50/100/150/200 km rings (at given px/km) collect the most dark pixels.
const [file, panel, kmPerPx] = process.argv.slice(2);
const { w, h, data } = load(file);
const dark = new Uint8Array(w * h);
for (let k = 0; k < w * h; k++) { const i = k * 4, r = data[i], g = data[i + 1], b = data[i + 2]; const mx = Math.max(r, g, b); if (mx < 90 && mx - Math.min(r, g, b) < 30) dark[k] = 1; }
const radii = [50, 100, 150, 200].map((km) => km / +kmPerPx);
const gx = Math.round((w - +panel) / 2), gy = Math.round(h / 2);
let best = [0];
for (let cx = gx - 40; cx <= gx + 40; cx++) for (let cy = gy - 40; cy <= gy + 40; cy++) {
  let hit = 0, n = 0;
  for (const R of radii) for (let a = 0; a < 360; a += 2) {
    const x = Math.round(cx + R * Math.cos((a * Math.PI) / 180)), y = Math.round(cy + R * Math.sin((a * Math.PI) / 180));
    if (x < 1 || y < 1 || x >= w - +panel - 1 || y >= h - 1) continue; n++;
    if (dark[y * w + x] || dark[y * w + x + 1] || dark[y * w + x - 1] || dark[(y + 1) * w + x] || dark[(y - 1) * w + x]) hit++;
  }
  if (n && hit / n > best[0]) best = [hit / n, cx, cy];
}
console.log(JSON.stringify({ file, w, h, ringScore: +best[0].toFixed(2), cx: best[1], cy: best[2] }));
