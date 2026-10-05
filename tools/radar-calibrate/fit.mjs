import fs from 'node:fs';
import { load } from './decode.mjs';
// Approximate radar sites (lat, lng) used only to centre the search; the fit finds the real placement.
const SITES = {
  cri240: [19.96, 99.88], mhs240: [19.3, 97.97], phs240: [16.78, 100.27], kkn240: [16.43, 102.83], skn240: [17.15, 104.13],
  srn240: [14.88, 103.49], ubn120: [15.25, 104.87], ubn240: [15.25, 104.87], svp120: [13.69, 100.75], skm240: [13.41, 100.0],
  cmp240: [10.49, 99.18], pkt240: [7.89, 98.3], stp240: [7.19, 100.6], njk: [13.83, 100.85], nkm: [13.74, 100.35],
  omkoi: [17.8, 98.36], phimai: [15.22, 102.49], sattahip: [12.68, 100.98], rongkwang: [18.34, 100.32], rasisalai: [15.34, 104.15],
  banphue: [17.69, 102.47], pathio: [10.85, 99.48], takhli: [15.26, 100.3],
};
const id = process.argv[2];
const mode = process.argv[3]; // 'dark' or 'light' province lines
const [sMin, sMax] = process.argv[4].split(',').map(Number);
const ignoreRight = Number(process.argv[5] ?? 0), ignoreLeft = Number(process.argv[6] ?? 0);
const [refX, refY] = (process.argv[7] ?? '').split(',').map(Number);
const span = Number(process.argv[8] ?? 0.6);
const [glat, glng] = SITES[id];
const img = load(process.env.IMAGE_DIR ? `${process.env.IMAGE_DIR}/${id}.jpg` : `images/${id}.jpg`);
const { w, h, data } = img;
const raw = new Uint8Array(w * h);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = (y * w + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mode === 'dark' ? mx < 85 && mx - mn < 30 : mn > 195 && mx - mn < 35) raw[y * w + x] = 1;
}
const mask = new Uint8Array(w * h);
for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++)
  if (raw[y * w + x] || raw[y * w + x - 1] || raw[y * w + x + 1] || raw[(y - 1) * w + x] || raw[(y + 1) * w + x]) mask[y * w + x] = 1;
const gj = JSON.parse(fs.readFileSync(new URL('../boundaries/.cache/gb_adm1.geojson', import.meta.url), 'utf8'));
const pts = [];
for (const f of gj.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) for (const ring of poly) for (let i = 1; i < ring.length; i++) {
    const [x1, y1] = ring[i - 1], [x2, y2] = ring[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 0.008));
    for (let k = 0; k < n; k++) {
      const lon = x1 + ((x2 - x1) * k) / n, lat = y1 + ((y2 - y1) * k) / n;
      if (Math.abs(lat - glat) < 3.2 && Math.abs(lon - glng) < 3.2) pts.push([lon, lat]);
    }
  }
}
const cx = Number.isFinite(refX) ? refX : w / 2, cy = Number.isFinite(refY) ? refY : h / 2; // lat0/lon0 = location of this pixel
const score = (lat0, lon0, s) => {
  const sx = s / (111.32 * Math.cos((lat0 * Math.PI) / 180)), sy = s / 110.57;
  let hit = 0, n = 0;
  for (const [lon, lat] of pts) {
    const x = Math.round(cx + (lon - lon0) / sx), y = Math.round(cy - (lat - lat0) / sy);
    if (x < ignoreLeft + 2 || x >= w - ignoreRight - 2 || y < 2 || y >= h - 2) continue;
    n++; if (mask[y * w + x]) hit++;
  }
  return n > 400 ? hit / n : 0;
};
let best = [0];
for (let lat0 = glat - span; lat0 <= glat + span; lat0 += 0.02)
  for (let lon0 = glng - span; lon0 <= glng + span; lon0 += 0.02)
    for (let s = sMin; s <= sMax; s += Math.max(0.004, (sMax - sMin) / 8)) { const v = score(lat0, lon0, s); if (v > best[0]) best = [v, lat0, lon0, s]; }
let [, la, lo, sc] = best;
for (let a = la - 0.05; a <= la + 0.05; a += 0.004) for (let b = lo - 0.05; b <= lo + 0.05; b += 0.004)
  for (let s = sc - 0.025; s <= sc + 0.025; s += 0.0025) { const v = score(a, b, s); if (v > best[0]) best = [v, a, b, s]; }
const [v, lat0, lon0, s] = best;
const sx = s / (111.32 * Math.cos((lat0 * Math.PI) / 180)), sy = s / 110.57;
const bounds = [[lat0 - (h - cy) * sy, lon0 - cx * sx], [lat0 + cy * sy, lon0 + (w - cx) * sx]].map((p) => p.map((q) => +q.toFixed(4)));
console.log(JSON.stringify({ id, w, h, score: +v.toFixed(3), centerPx: [lat0.toFixed(3), lon0.toFixed(3)], kmPerPx: +s.toFixed(4), bounds }));
