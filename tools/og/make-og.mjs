// Social share images (Open Graph / Twitter), 1200×630, one per language. Text comes from the app's i18n strings.
// Usage: node tools/og/make-og.mjs   (sharp comes with Next.js in apps/web; Node strips the types from messages.ts)
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { messages } from '../../packages/core/src/i18n/messages.ts';

const repo = (rel) => new URL(`../../${rel}`, import.meta.url).pathname;

// sharp's Pango uses CoreText on macOS and ignores bundled fonts; force fontconfig and point it at the app's Plex files.
const fontconf = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hw-og-')), 'fonts.conf');
fs.writeFileSync(
  fontconf,
  `<?xml version="1.0"?><fontconfig><dir>${repo('apps/mobile/assets/fonts')}</dir><cachedir>${path.dirname(fontconf)}</cachedir></fontconfig>`,
);
process.env.FONTCONFIG_FILE = fontconf;
process.env.PANGOCAIRO_BACKEND = 'fc';

const webRequire = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const sharp = createRequire(webRequire.resolve('next/package.json'))('sharp');

const W = 1200;
const H = 630;
const BRAND = '#0F1B2E';
const INK = '#E6EBF3';
const MUTED = '#94A1B8';
const WATER = '#3D7BFF';
const ICON = 300;
const LEFT = 96;
const COL = LEFT + ICON + 72;
const COL_W = W - COL - 80;

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Pango text block; `size` is in px because dpi is 72. */
async function text(str, { weight, size, color }) {
  const { data, info } = await sharp({
    text: {
      text: `<span foreground="${color}">${escape(str)}</span>`,
      font: `IBM Plex Sans Thai ${weight} ${size}`,
      width: COL_W,
      dpi: 72,
      rgba: true,
      wrap: 'word',
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { input: data, height: info.height };
}

async function render(lang) {
  const other = lang === 'th' ? 'en' : 'th';
  const blocks = [
    await text(messages['app.name'][lang], { weight: 'Bold', size: 88, color: '#FFFFFF' }),
    await text(messages['app.name'][other], { weight: 'Medium', size: 36, color: MUTED }),
    await text(messages['app.tagline'][lang], { weight: 'Medium', size: 40, color: INK }),
  ];
  const gaps = [0, 16, 36];
  const total = blocks.reduce((sum, b, i) => sum + b.height + gaps[i], 0);
  let top = Math.round((H - total) / 2);
  const layers = blocks.map((b, i) => {
    top += gaps[i];
    const layer = { input: b.input, left: COL, top };
    top += b.height;
    return layer;
  });

  const icon = await sharp(fs.readFileSync(repo('tools/icons/source/hazardwatch-icon.svg')), { density: (72 * ICON) / 512 })
    .resize(ICON, ICON)
    .png()
    .toBuffer();
  // Water-blue rule along the bottom echoes the icon's waves without borrowing a severity colour.
  const rule = await sharp({ create: { width: W, height: 10, channels: 3, background: WATER } }).png().toBuffer();

  return sharp({ create: { width: W, height: H, channels: 3, background: BRAND } })
    .composite([{ input: icon, left: LEFT, top: Math.round((H - ICON) / 2) }, ...layers, { input: rule, left: 0, top: H - 10 }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

fs.mkdirSync(repo('apps/web/public/og'), { recursive: true });
for (const lang of ['th', 'en']) fs.writeFileSync(repo(`apps/web/public/og/og-${lang}.png`), await render(lang));
console.log('og images written');
