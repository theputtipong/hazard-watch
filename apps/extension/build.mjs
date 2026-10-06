/**
 * Bundles the extension into dist/ (load it unpacked from there, or zip it for the store).
 *   pnpm --filter @hw/extension build            # production API
 *   API_BASE=http://localhost:8787 pnpm --filter @hw/extension build
 *   pnpm --filter @hw/extension run zip          # build + zip for the Chrome / Edge stores
 * Upload only the zip from `run zip`: it has manifest.json at its root. Zipping the whole folder fails store
 * validation (static/manifest.json is only the template).
 */
import { build, context } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const out = 'dist';
const apiBase = process.env.API_BASE ?? 'https://api.hazard.pdouvch.com';
const siteUrl = process.env.SITE_URL ?? 'https://hazard.pdouvch.com';

rmSync(out, { recursive: true, force: true });
// Icons in static/icons come from tools/icons/make-icons.mjs.
cpSync('static', out, { recursive: true });

// The API host must be listed for fetches from the service worker to skip CORS.
const manifest = JSON.parse(readFileSync('static/manifest.json', 'utf8'));
manifest.host_permissions = [`${new URL(apiBase).origin}/*`];
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
manifest.version = version;
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

if (process.argv.includes('--zip')) {
  const zip = `hazardwatch-extension-${version}.zip`;
  rmSync(zip, { force: true });
  // Zip the contents of dist/, not the folder, so manifest.json sits at the root of the package.
  execFileSync('zip', ['-r', '-X', `../${zip}`, '.', '-x', '.*'], { cwd: out, stdio: 'inherit' });
  console.log(`\n${zip} ready to upload`);
}
