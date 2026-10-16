// Writes lib/bma/bangkok_districts.g.dart from the district outlines the ingest worker uses
// (apps/web/public/geo/districts-lite.json), so street-flood sensors fetched on the phone land in the same district as on
// the server. `--check` fails instead of writing when the file is stale. Output is already `dart format`-clean.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, '../web/public/geo/districts-lite.json');
const out = 'lib/bma/bangkok_districts.g.dart';
const check = process.argv.includes('--check');

const num = (n) => (Number.isInteger(n) ? `${n}.0` : String(n));
const features = JSON.parse(readFileSync(source, 'utf8')).features.filter((f) => f.properties.parent === 'TH10');

const entries = features.map((f) => {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  if (polys.length !== 1) throw new Error(`${f.properties.id}: MultiPolygon with several parts is not supported`);
  const rings = polys[0].map((ring) => `'${ring.map(([lng, lat]) => `${num(lng)},${num(lat)}`).join(' ')}'`);
  // Match `dart format` (page_width 120): a ring list that fits goes on one line.
  const oneLine = `    rings: [${rings.join(', ')}],`;
  return [
    `  '${f.properties.id}': Zone(`,
    `    bbox: [${f.properties.bbox.map(num).join(', ')}],`,
    ...(oneLine.length <= 120 ? [oneLine] : ['    rings: [', ...rings.map((r) => `      ${r},`), '    ],']),
    '  ),',
  ].join('\n');
});

const content = `// GENERATED from apps/web/public/geo/districts-lite.json by tool/gen_geo.mjs. Do not edit.

import 'geo.dart';

const bangkokDistricts = <String, Zone>{
${entries.join('\n')}
};
`;

const path = join(root, out);
let current = null;
try {
  current = readFileSync(path, 'utf8');
} catch {}
if (current !== content) {
  if (check) {
    console.error(`${out} is out of date with apps/web/public/geo/districts-lite.json. Run: pnpm --filter @hw/mobile generate`);
    process.exit(1);
  }
  writeFileSync(path, content);
  console.log(`wrote ${out}`);
}
