import { messages } from './messages';

export { messages };
export const LANGS = ['th', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export type MessageKey = keyof typeof messages;

export const DEFAULT_LANG: Lang = 'th';

export function t(key: MessageKey, lang: Lang, vars?: Record<string, string | number>): string {
  const text: string = messages[key][lang];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}
