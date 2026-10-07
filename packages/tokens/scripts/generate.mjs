// Writes every platform's copy of the design system from tokens.json. `--check` fails instead of writing when a file is stale.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf8'));
const check = process.argv.includes('--check');

const header = (comment) => `${comment} GENERATED from packages/tokens/tokens.json by scripts/generate.mjs. Do not edit.`;
const camel = (name) => name.replace(/-(\w)/g, (_, c) => c.toUpperCase());
const strip = (obj) => Object.fromEntries(Object.entries(obj).filter(([k]) => !k.startsWith('$')));

const { light, dark, cvd, darkCvd } = tokens.color;
// Same order as the CSS cascade, so every platform resolves a mode to the same colours.
const palettes = {
  light: { ...light },
  dark: { ...light, ...dark },
  lightCvd: { ...light, ...cvd },
  darkCvd: { ...light, ...dark, ...cvd, ...darkCvd },
};
const text = strip(tokens.text);
const meter = strip(tokens.meter);

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// ---- CSS (Tailwind v4 theme for apps/web) ----

const cssShadow = (s) => (s ? `0 ${s.y}px ${s.blur}px rgba(${rgb(s.color).join(', ')}, ${s.opacity})` : 'none');
const cssVars = (colors, indent = '  ') => Object.entries(colors).map(([k, v]) => `${indent}--color-${k}: ${v};`);
const cssFont = [`var(${tokens.font.webVariable})`, ...tokens.font.fallback.map((f) => (f.includes(' ') ? `"${f}"` : f))].join(', ');

function css() {
  const textVars = Object.entries(text).flatMap(([name, t]) => [
    `  --text-${name}: ${t.size}px;`,
    `  --text-${name}--line-height: ${t.lineHeight}px;`,
    ...(t.weight ? [`  --text-${name}--font-weight: ${t.weight};`] : []),
    ...(t.letterSpacing ? [`  --text-${name}--letter-spacing: ${t.letterSpacing}em;`] : []),
  ]);
  const meterCss = (sel, m) => [
    ...(sel === '' ? [] : [`.hw-meter${sel} { height: ${m.barHeights[2]}px; gap: ${m.gap}px; }`, `.hw-meter${sel} i { width: ${m.barWidth}px; }`]),
    ...m.barHeights.map((h, i) => `.hw-meter${sel} i:nth-child(${i + 1}) { height: ${h}px; }`),
  ];
  return [
    header('/*') + ' */',
    '',
    '/* Components use these token names, never raw hex. sev-* means risk only: never for decoration, buttons or system status. */',
    '@theme {',
    `  --font-sans: ${cssFont};`,
    '',
    ...cssVars(light),
    '',
    ...textVars,
    '',
    ...Object.entries(tokens.radius).map(([k, v]) => `  --radius-${k}: ${v}px;`),
    '',
    `  --shadow-raised: ${cssShadow(tokens.shadow.light.raised)};`,
    `  --shadow-overlay: ${cssShadow(tokens.shadow.light.overlay)};`,
    '}',
    '',
    ":root[data-theme='dark'] {",
    '  color-scheme: dark;',
    ...cssVars(dark),
    `  --shadow-raised: ${cssShadow(tokens.shadow.dark.raised)};`,
    `  --shadow-overlay: ${cssShadow(tokens.shadow.dark.overlay)};`,
    '}',
    '',
    ":root[data-cvd='on'] {",
    ...cssVars(cvd),
    '}',
    '',
    ":root[data-theme='dark'][data-cvd='on'] {",
    ...cssVars(darkCvd),
    '}',
    '',
    '/* The only motion in the design system: fresh data fades in. */',
    '@media (prefers-reduced-motion: no-preference) {',
    '  .hw-fade-in {',
    `    animation: hw-fade-in ${tokens.motion.fadeInMs}ms ease-out;`,
    '  }',
    '}',
    '@keyframes hw-fade-in {',
    '  from {',
    '    opacity: 0;',
    '  }',
    '}',
    '',
    '/* Level = number of filled bars, so severity reads without colour. */',
    '.hw-meter {',
    '  display: inline-flex;',
    '  align-items: flex-end;',
    `  gap: ${meter.sm.gap}px;`,
    `  height: ${meter.sm.barHeights[2]}px;`,
    '}',
    '.hw-meter i {',
    '  display: block;',
    `  width: ${meter.sm.barWidth}px;`,
    '  border-radius: var(--radius-tiny);',
    '  background: currentColor;',
    `  opacity: ${meter.inactiveOpacity};`,
    '}',
    ...meterCss('', meter.sm),
    ".hw-meter[data-level='1'] i:nth-child(-n + 1),",
    ".hw-meter[data-level='2'] i:nth-child(-n + 2),",
    ".hw-meter[data-level='3'] i { opacity: 1; }",
    ...meterCss('--lg', meter.lg),
    '',
  ].join('\n');
}

// ---- TypeScript (for colours the web passes to Leaflet, which cannot read CSS variables) ----

const camelColors = (colors) => Object.fromEntries(Object.entries(colors).map(([k, v]) => [camel(k), v]));

function ts() {
  const resolved = Object.fromEntries(Object.entries(palettes).map(([mode, colors]) => [mode, camelColors(colors)]));
  return [
    header('//'),
    '',
    `export const palettes = ${JSON.stringify(resolved, null, 2)} as const;`,
    '',
    'export type PaletteMode = keyof typeof palettes;',
    'export type Palette = (typeof palettes)[PaletteMode];',
    '',
    `export const radius = ${JSON.stringify(tokens.radius)} as const;`,
    '',
  ].join('\n');
}

// ---- Dart (Flutter, apps/mobile) ----
// The app's own design system (apps/mobile/lib/theme/hw_theme.dart) owns sizes and type. From the web it takes only the
// colour-blind palettes, and its tests compare its light/dark colours with these so the two channels never drift.
// Written in `dart format` style (page width 120, see apps/mobile/analysis_options.yaml) so CI's format check passes.

const dartColor = (hex) => `Color(0xFF${hex.slice(1).toUpperCase()})`;

function dart() {
  const fields = Object.keys(light).map(camel);
  const palette = (name, colors) =>
    [`  static const ${name} = WebPalette(`, ...Object.entries(colors).map(([k, v]) => `    ${camel(k)}: ${dartColor(v)},`), '  );'].join('\n');
  return [
    header('//'),
    '',
    "import 'dart:ui' show Color;",
    '',
    '/// The web\'s colour tokens resolved for one mode (same names as HwColors).',
    'class WebPalette {',
    '  const WebPalette({',
    ...fields.map((f) => `    required this.${f},`),
    '  });',
    '',
    ...fields.map((f) => `  final Color ${f};`),
    '}',
    '',
    'abstract final class WebPalettes {',
    palette('light', palettes.light),
    palette('dark', palettes.dark),
    '',
    '  /// Colour-blind safe severity colours (Paul Tol "muted"); hues also differ in lightness.',
    palette('lightCvd', palettes.lightCvd),
    palette('darkCvd', palettes.darkCvd),
    '}',
    '',
  ].join('\n');
}

const outputs = {
  'generated/theme.css': css(),
  'generated/tokens.ts': ts(),
  // The Flutter app can only import Dart from inside its own package.
  '../../apps/mobile/lib/theme/web_palettes.g.dart': dart(),
};

let stale = 0;
for (const [file, content] of Object.entries(outputs)) {
  const path = join(root, file);
  let current = null;
  try {
    current = readFileSync(path, 'utf8');
  } catch {}
  if (current === content) continue;
  if (check) {
    console.error(`${file} is out of date with tokens.json. Run: pnpm --filter @hw/tokens generate`);
    stale++;
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    console.log(`wrote ${file}`);
  }
}
if (stale) process.exit(1);
