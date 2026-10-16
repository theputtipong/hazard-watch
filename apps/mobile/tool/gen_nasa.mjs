// Writes lib/map/nasa_layers.g.dart from packages/core/src/nasa.ts (NASA_LAYERS, NASA_POINT_LAYERS, GIBS,
// NASA_ATTRIBUTION), so the app asks GIBS for the same layers, zooms and days as the web. `--check` fails instead of
// writing when the file is stale. Output is already `dart format`-clean.
import { readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// nasa.ts imports './geo' without an extension (bundler style); Node only strips types, so add `.ts` for it.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (!specifier.startsWith('.') || /\.\w+$/.test(specifier)) throw e;
      return next(`${specifier}.ts`, context);
    }
  },
});

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { GIBS, NASA_ATTRIBUTION, NASA_LAYERS, NASA_POINT_LAYERS } = await import('../../../packages/core/src/nasa.ts');
const out = 'lib/map/nasa_layers.g.dart';
const check = process.argv.includes('--check');

const str = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\$/g, '\\$')}'`;
const num = (n) => (Number.isInteger(n) ? `${n}.0` : `${n}`);

const layers = Object.values(NASA_LAYERS).map(
  (l) => `  ${str(l.id)}: NasaLayer(
    id: ${str(l.id)},
    gibsLayer: ${str(l.gibsLayer)},
    service: GibsService.${l.service},
    format: ${str(l.format)},
    maxNativeZoom: ${l.maxNativeZoom},
    time: GibsTime.${l.time === 'default' ? 'defaultDay' : l.time},
    opacity: ${num(l.opacity)},
    defaultOn: ${l.defaultOn},
    attribution: ${str(l.attribution)},
  ),`,
);
const points = Object.values(NASA_POINT_LAYERS).map(
  (p) => `  ${str(p.id)}: NasaPointLayer(id: ${str(p.id)}, defaultOn: ${p.defaultOn}, attribution: ${str(p.attribution)}),`,
);

const content = `// GENERATED from packages/core/src/nasa.ts by tool/gen_nasa.mjs. Do not edit.

enum GibsService { wmts, wms }

/// \`defaultDay\` lets GIBS pick its newest day; \`yesterday\` is the UTC day before (WMS has no TIME=default).
enum GibsTime { defaultDay, yesterday }

/// One GIBS raster layer (NasaLayer in packages/core/src/nasa.ts).
class NasaLayer {
  const NasaLayer({
    required this.id,
    required this.gibsLayer,
    required this.service,
    required this.format,
    required this.maxNativeZoom,
    required this.time,
    required this.opacity,
    required this.defaultOn,
    required this.attribution,
  });

  final String id;
  final String gibsLayer;
  final GibsService service;
  final String format;

  /// GIBS answers 400 above this zoom, so the map must overzoom.
  final int maxNativeZoom;
  final GibsTime time;
  final double opacity;
  final bool defaultOn;
  final String attribution;
}

/// Drawn from our own snapshot, not GIBS.
class NasaPointLayer {
  const NasaPointLayer({required this.id, required this.defaultOn, required this.attribution});

  final String id;
  final bool defaultOn;
  final String attribution;
}

abstract final class Gibs {
  static const wmts = ${str(GIBS.wmts)};
  static const wms = ${str(GIBS.wms)};
}

abstract final class NasaAttribution {
${Object.entries(NASA_ATTRIBUTION)
  .map(([k, v]) => `  static const ${k} = ${str(v)};`)
  .join('\n')}
}

const Map<String, NasaLayer> nasaLayers = {
${layers.join('\n')}
};

const Map<String, NasaPointLayer> nasaPointLayers = {
${points.join('\n')}
};

/// GIBS dates daily products by UTC day.
String gibsUtcYesterday(DateTime now) =>
    now.toUtc().subtract(const Duration(days: 1)).toIso8601String().substring(0, 10);

/// WMTS template with {z}/{y}/{x}; WMS layers get the base URL (pair with [gibsWmsParams]).
String gibsTileUrl(NasaLayer l, DateTime now) {
  if (l.service == GibsService.wms) return Gibs.wms;
  final time = l.time == GibsTime.defaultDay ? 'default' : gibsUtcYesterday(now);
  return '\${Gibs.wmts}/\${l.gibsLayer}/default/\$time/GoogleMapsCompatible_Level\${l.maxNativeZoom}/{z}/{y}/{x}.\${l.format}';
}

/// WMS has no TIME=default, so any layer asked for over WMS uses yesterday: today's file is still filling.
Map<String, String> gibsWmsParams(NasaLayer l, DateTime now) => {
  'LAYERS': l.gibsLayer,
  'FORMAT': 'image/\${l.format == 'jpg' ? 'jpeg' : 'png'}',
  'TRANSPARENT': 'true',
  'TIME': gibsUtcYesterday(now),
};
`;

const path = join(root, out);
let current = null;
try {
  current = readFileSync(path, 'utf8');
} catch {}
if (current !== content) {
  if (check) {
    console.error(`${out} is out of date with packages/core/src/nasa.ts. Run: pnpm --filter @hw/mobile generate`);
    process.exit(1);
  }
  writeFileSync(path, content);
  console.log(`wrote ${out}`);
}
