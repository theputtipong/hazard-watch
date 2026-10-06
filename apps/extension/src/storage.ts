import { DEFAULT_CONFIG, type PushKind } from '@hw/core';
import { isLang, type Lang } from '@hw/core/i18n';
import { EXT } from './config';
import type { Place } from './status';

export interface Settings {
  lang: Lang;
  place: Place | null;
  notify: boolean;
  kinds: PushKind[];
  pm25At: number;
}

const uiLang = (): Lang => (chrome.i18n.getUILanguage().toLowerCase().startsWith('th') ? 'th' : 'en');

export async function getSettings(): Promise<Settings> {
  const s = (await chrome.storage.local.get(['lang', 'place', 'notify', 'kinds', 'pm25At'])) as Partial<Settings>;
  return {
    lang: isLang(s.lang) ? s.lang : uiLang(),
    place: s.place ?? null,
    notify: s.notify ?? true,
    kinds: Array.isArray(s.kinds) ? s.kinds : [...EXT.defaultKinds],
    pm25At: typeof s.pm25At === 'number' ? s.pm25At : DEFAULT_CONFIG.pm25.pushAt,
  };
}

export const saveSettings = (patch: Partial<Settings>) => chrome.storage.local.set(patch);

/** Alert key → last shown, so a hazard isn't repeated within push.cooldownHours. */
export async function getSent(): Promise<Record<string, string>> {
  return ((await chrome.storage.local.get('sent')).sent as Record<string, string> | undefined) ?? {};
}

export const saveSent = (sent: Record<string, string>) => chrome.storage.local.set({ sent });
