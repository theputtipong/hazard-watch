import { load } from './decode.mjs';
// Exact legend colours: saturated colours that fill legend blocks (>= minCount pixels), from a legend rectangle.
const [file, x0, y0, x1, y1, minCount] = process.argv.slice(2);
const { w, data } = load(file);
const seen = new Map();
for (let y = +y0; y < +y1; y++) for (let x = +x0; x < +x1; x++) {
  const i = (y * w + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
  if (Math.max(r, g, b) - Math.min(r, g, b) < 60) continue; // skip greys/white/text
  const k = `${r},${g},${b}`; seen.set(k, (seen.get(k) || 0) + 1);
}
const cols = [...seen].filter(([, n]) => n >= +minCount).map(([k]) => k.split(',').map(Number));
console.log(JSON.stringify(cols));
