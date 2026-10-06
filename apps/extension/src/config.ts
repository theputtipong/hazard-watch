import { DEFAULT_CONFIG, type PushKind } from '@hw/core';

// Set by build.mjs (esbuild define); the fallbacks are for tests.
declare const __API_BASE__: string | undefined;
declare const __SITE_URL__: string | undefined;

export const EXT = {
  apiBase: typeof __API_BASE__ === 'string' ? __API_BASE__ : 'https://api.hazard.pdouvch.com',
  siteUrl: typeof __SITE_URL__ === 'string' ? __SITE_URL__ : 'https://hazard.pdouvch.com',
  /** How often the background worker checks for new alerts (Chrome allows 1 min at the least). */
  pollMinutes: 15,
  /** Notification defaults (same as web push): every hazard, PM2.5 from the national standard. */
  defaultKinds: DEFAULT_CONFIG.push.kinds as PushKind[],
  pm25Choices: [25, 37.5, 50, 75],
  /** Same as WEB.map.driftCalmKmh: slower cloud-level wind reads as "rain barely moving". */
  driftCalmKmh: 5,
  /** Toolbar badge: design system solid sev-* colours, with on-sev / on-sev-danger text. */
  badgeColor: { watch: '#b07f00', warn: '#e0640a', danger: '#c81e1e' },
  badgeText: { watch: '#0f1b2e', warn: '#0f1b2e', danger: '#ffffff' },
  /** Alert banners shown at once in the popup; the rest fold into "see all". */
  maxBanners: 3,
} as const;
