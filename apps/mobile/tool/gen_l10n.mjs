// Writes lib/l10n/app_{th,en}.arb from the web's messages (packages/core/src/i18n/messages.ts), so both apps say the
// same thing, merged with l10n/mobile_messages.json (app-only strings and the mobile design system's wording, which win).
// `--check` fails instead of writing when a file is stale. Node strips the TS types on import.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { messages: web } = await import('../../../packages/core/src/i18n/messages.ts');
const mobile = JSON.parse(readFileSync(join(root, 'l10n/mobile_messages.json'), 'utf8'));
const messages = { ...web, ...Object.fromEntries(Object.entries(mobile).filter(([k]) => !k.startsWith('$'))) };
const check = process.argv.includes('--check');

// 'zone.level2.bkk' -> 'zoneLevel2Bkk': ARB keys must be Dart identifiers.
const dartKey = (key) => key.replace(/[._-](\w)/g, (_, c) => c.toUpperCase());

const keys = Object.keys(messages);
const seen = new Map();
for (const key of keys) {
  const k = dartKey(key);
  if (seen.has(k)) throw new Error(`"${key}" and "${seen.get(k)}" both become ${k}`);
  seen.set(k, key);
}

function arb(lang, template) {
  const out = { '@@locale': lang, '@@x-generated': 'From packages/core/src/i18n/messages.ts + l10n/mobile_messages.json by tool/gen_l10n.mjs. Do not edit.' };
  for (const key of keys) {
    const text = messages[key][lang];
    out[dartKey(key)] = text;
    if (!template) continue;
    // Every placeholder is a String: callers format numbers first, like t() on the web.
    const names = [...new Set([...messages[key].th.matchAll(/\{(\w+)\}/g), ...messages[key].en.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];
    out[`@${dartKey(key)}`] = {
      description: key,
      ...(names.length ? { placeholders: Object.fromEntries(names.map((n) => [n, { type: 'String' }])) } : {}),
    };
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

const outputs = { 'lib/l10n/app_th.arb': arb('th', true), 'lib/l10n/app_en.arb': arb('en', false) };

let stale = 0;
for (const [file, content] of Object.entries(outputs)) {
  const path = join(root, file);
  let current = null;
  try {
    current = readFileSync(path, 'utf8');
  } catch {}
  if (current === content) continue;
  if (check) {
    console.error(`${file} is out of date with messages.ts / mobile_messages.json. Run: pnpm --filter @hw/mobile generate`);
    stale++;
  } else {
    writeFileSync(path, content);
    console.log(`wrote ${file}`);
  }
}
if (stale) process.exit(1);
