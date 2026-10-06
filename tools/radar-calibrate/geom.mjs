import { load } from './decode.mjs';
// Crosshair centre (longest dark lines) + ring radii (radial histogram of dark pixels) for one image.
const [file, leftS] = process.argv.slice(2);
const left = +leftS;
const { w, h, data } = load(file);
const dark = (x, y) => { const i = (y * w + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2]; const mx = Math.max(r, g, b); return mx < 80 && mx - Math.min(r, g, b) < 30; };
let br = [0, 0], bc = [0, 0];
for (let y = 15; y < h - 25; y++) { let n = 0; for (let x = left; x < w - 3; x++) if (dark(x, y)) n++; if (n > br[1]) br = [y, n]; }
for (let x = left + 3; x < w - 3; x++) { let n = 0; for (let y = 15; y < h - 25; y++) if (dark(x, y)) n++; if (n > bc[1]) bc = [x, n]; }
const cx = bc[0], cy = br[0];
const hit = new Array(800).fill(0), tot = new Array(800).fill(0);
for (let y = 0; y < h; y++) for (let x = left; x < w; x++) {
  if (Math.abs(x - cx) < 3 || Math.abs(y - cy) < 3) continue;
  const r = Math.round(Math.hypot(x - cx, y - cy)); if (r >= 800) continue; tot[r]++; if (dark(x, y)) hit[r]++;
}
const f = hit.map((v, r) => (tot[r] > 40 ? v / tot[r] : 0));
const peaks = [];
for (let r = 20; r < 790; r++) if (f[r] > 0.18 && f[r] >= f[r - 1] && f[r] >= f[r + 1] && f[r] >= (f[r - 2] ?? 0) && f[r] >= (f[r + 2] ?? 0)) peaks.push(r);
console.log(JSON.stringify({ file: file.replace('all/', ''), w, h, cx, cy, lineStrength: [bc[1], br[1]], rings: peaks }));
