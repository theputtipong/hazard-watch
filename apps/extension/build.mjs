// Upload only the `run zip` output: zipping the whole folder fails store validation (static/manifest.json is a template).
import { build, context } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const out = 'dist';
const apiBase = process.env.API_BASE ?? 'https://api.hazard.pdouvch.com';
const siteUrl = process.env.SITE_URL ?? 'https://hazard.pdouvch.com';

rmSync(out, { recursive: true, force: true });
cpSync('static', out, { recursive: true });

// The API host must be listed for fetches from the service worker to skip CORS.
const manifest = JSON.parse(readFileSync('static/manifest.json', 'utf8'));
// BMA sends no CORS headers and blocks non-Thai IPs, so the worker on a Thai user's machine fetches it for the relay.
manifest.host_permissions = [`${new URL(apiBase).origin}/*`, 'https://weather.bangkok.go.th/*'];
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
  // Zip dist/'s contents, not the folder, so manifest.json sits at the package root.
  execFileSync('zip', ['-r', '-X', `../${zip}`, '.', '-x', '.*'], { cwd: out, stdio: 'inherit' });
  console.log(`\n${zip} ready to upload`);
}
