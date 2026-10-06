/**
 * Bundles the extension into dist/ (load it unpacked from there, or zip it for the store).
 *   pnpm --filter @hw/extension build            # production API
 *   API_BASE=http://localhost:8787 pnpm --filter @hw/extension build
 */
import { build, context } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const out = 'dist';
const apiBase = process.env.API_BASE ?? 'https://api.hazard.pdouvch.com';
const siteUrl = process.env.SITE_URL ?? 'https://hazard.pdouvch.com';

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/icons`, { recursive: true });
cpSync('static', out, { recursive: true });
for (const size of [192, 512]) cpSync(`../web/public/icons/icon-${size}.png`, `${out}/icons/icon-${size}.png`);

// The API host must be listed for fetches from the service worker to skip CORS.
const manifest = JSON.parse(readFileSync('static/manifest.json', 'utf8'));
manifest.host_permissions = [`${new URL(apiBase).origin}/*`];
manifest.version = JSON.parse(readFileSync('package.json', 'utf8')).version;
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));

const options = {
  entryPoints: { background: 'src/background.ts', popup: 'src/popup.ts' },
  outdir: out,
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  minify: !process.argv.includes('--watch'),
  define: { __API_BASE__: JSON.stringify(apiBase), __SITE_URL__: JSON.stringify(siteUrl) },
  logLevel: 'info',
};

if (process.argv.includes('--watch')) await (await context(options)).watch();
else await build(options);
