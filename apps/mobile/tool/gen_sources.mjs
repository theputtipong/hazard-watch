// Writes lib/sources_meta.g.dart from packages/core/src/sources-meta.ts, so the app links to the same agency pages
// as the web. `--check` fails instead of writing when the file is stale. Output is already `dart format`-clean.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { SOURCE_META } = await import('../../../packages/core/src/sources-meta.ts');
const out = 'lib/sources_meta.g.dart';
const check = process.argv.includes('--check');

const str = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\$/g, '\\$')}'`;
// Matches `dart format` at page_width 120: one line when it fits, else one argument per line.
const entries = Object.values(SOURCE_META).map(({ id, url, domain, gov }) => {
  const args = [`id: ${str(id)}`, `url: ${str(url)}`, `domain: ${str(domain)}`, `gov: ${gov}`];
  const line = `  ${str(id)}: SourceMeta(${args.join(', ')}),`;
  return line.length <= 120 ? line : `  ${str(id)}: SourceMeta(\n${args.map((a) => `    ${a},`).join('\n')}\n  ),`;
});

const content = `// GENERATED from packages/core/src/sources-meta.ts by tool/gen_sources.mjs. Do not edit.

class SourceMeta {
  const SourceMeta({required this.id, required this.url, required this.domain, required this.gov});

  final String id;
  final String url;

  /// Display text for the link, shown next to the agency name.
  final String domain;
  final bool gov;
}

const Map<String, SourceMeta> sourceMeta = {
${entries.join('\n')}
};

String? sourceUrl(String sourceId) => sourceMeta[sourceId]?.url;

String? sourceDomain(String sourceId) => sourceMeta[sourceId]?.domain;
`;

const path = join(root, out);
let current = null;
try {
  current = readFileSync(path, 'utf8');
} catch {}
if (current !== content) {
  if (check) {
    console.error(`${out} is out of date with packages/core/src/sources-meta.ts. Run: pnpm --filter @hw/mobile generate`);
    process.exit(1);
  }
  writeFileSync(path, content);
  console.log(`wrote ${out}`);
}
