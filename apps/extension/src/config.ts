import { DEFAULT_CONFIG, type PushKind } from '@hw/core';

// Set by build.mjs (esbuild define); the fallbacks are for tests.
declare const __API_BASE__: string | undefined;
declare const __SITE_URL__: string | undefined;

export const EXT = {
  apiBase: typeof __API_BASE__ === 'string' ? __API_BASE__ : 'https://api.hazard.pdouvch.com',
  siteUrl: typeof __SITE_URL__ === 'string' ? __SITE_URL__ : 'https://hazard.pdouvch.com',
  /** Chrome alarms allow 1 min at the least. */
  pollMinutes: 15,
  defaultKinds: DEFAULT_CONFIG.push.kinds as PushKind[],
  pm25Choices: [25, 37.5, 50, 75],
  /** Keep in sync with WEB.map.driftCalmKmh. */
  driftCalmKmh: 5,
  /** Design-system sev-* colours with on-sev / on-sev-danger text. */
  badgeColor: { watch: '#b07f00', warn: '#e0640a', danger: '#c81e1e' },
  badgeText: { watch: '#0f1b2e', warn: '#0f1b2e', danger: '#ffffff' },
  maxBanners: 3,
} as const;
