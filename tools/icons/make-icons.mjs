// Design-system artwork is never redrawn or recoloured. hazardwatch-icon.svg: 48px+; -small.svg: 32px and below.
// Usage: node tools/icons/make-icons.mjs   (sharp comes with Next.js in apps/web)
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const webRequire = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const sharp = createRequire(webRequire.resolve('next/package.json'))('sharp');

const BRAND = '#0F1B2E';
const src = (name) => fs.readFileSync(new URL(`source/${name}`, import.meta.url));
const full = src('hazardwatch-icon.svg');
const small = src('hazardwatch-icon-small.svg');

/** `bleed` fills the corners with brand navy (maskable / Apple icons); `pad` shrinks the art. */
async function render(svg, size, { bleed = false, pad = 0 } = {}) {
  const inner = Math.round(size * (1 - 2 * pad));
  const art = await sharp(svg, { density: Math.max(72, (72 * inner) / 512) }).resize(inner, inner).png().toBuffer();
  if (!bleed && !pad) return art;
  return sharp({ create: { width: size, height: size, channels: 4, background: bleed ? BRAND : { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: art, gravity: 'center' }])
    .png()
    .toBuffer();
}

const out = (rel) => new URL(`../../${rel}`, import.meta.url);
const write = async (rel, buf) => {
  fs.mkdirSync(path.dirname(out(rel).pathname), { recursive: true });
  fs.writeFileSync(out(rel), await buf);
};

await write('apps/web/public/icons/icon-192.png', render(full, 192));
await write('apps/web/public/icons/icon-512.png', render(full, 512));
// Maskable: full-bleed navy, artwork inside the 80% safe zone.
await write('apps/web/public/icons/icon-maskable-512.png', render(full, 512, { bleed: true, pad: 0.1 }));
await write('apps/web/src/app/icon.png', render(small, 64));
await write('apps/web/src/app/apple-icon.png', render(full, 180, { bleed: true }));
fs.copyFileSync(new URL('source/hazardwatch-icon-small.svg', import.meta.url), out('apps/web/public/icons/hazardwatch-icon-small.svg'));
fs.copyFileSync(new URL('source/hazardwatch-icon-small.svg', import.meta.url), out('apps/extension/static/icons/hazardwatch-icon-small.svg'));
for (const size of [16, 32]) await write(`apps/extension/static/icons/icon-${size}.png`, render(small, size));
for (const size of [48, 128]) await write(`apps/extension/static/icons/icon-${size}.png`, render(full, size));

// Mobile app. App Store rejects icons with an alpha channel, so iOS icons are flattened onto brand navy.
const opaque = async (buf) => sharp(await buf).removeAlpha().png().toBuffer();
const iconSet = 'apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset';
for (const { size, scale, filename } of JSON.parse(fs.readFileSync(out(`${iconSet}/Contents.json`))).images) {
  const px = Math.round(parseFloat(size) * parseInt(scale, 10));
  await write(`${iconSet}/${filename}`, opaque(render(px <= 32 ? small : full, px, { bleed: true })));
}
const androidRes = 'apps/mobile/android/app/src/main/res';
for (const [dpi, scale] of Object.entries({ mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
  await write(`${androidRes}/mipmap-${dpi}/ic_launcher.png`, render(full, 48 * scale));
  // Adaptive foreground (108dp): launchers mask to the centre 66-72dp, so the artwork is inset to stay visible.
  await write(`${androidRes}/mipmap-${dpi}/ic_launcher_foreground.png`, render(full, 108 * scale, { bleed: true, pad: 0.12 }));
}
await write('apps/mobile/store/icon-512.png', opaque(render(full, 512, { bleed: true })));
await write(
  'apps/mobile/store/feature-graphic-1024x500.png',
  sharp({ create: { width: 1024, height: 500, channels: 3, background: BRAND } })
    .composite([{ input: await render(full, 320), gravity: 'center' }])
    .png()
    .toBuffer(),
);
console.log('icons written');
