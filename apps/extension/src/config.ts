import { DEFAULT_CONFIG, type PushKind } from '@hw/core';

// Set by build.mjs (esbuild define); the fallbacks are for tests.
declare const __API_BASE__: string | undefined;
declare const __SITE_URL__: string | undefined;

export const EXT = {
  apiBase: typeof __API_BASE__ === 'string' ? __API_BASE__ : 'https://api.hazard.pdouvch.com',
  siteUrl: typeof __SITE_URL__ === 'string' ? __SITE_URL__ : 'https://hazard.pdouvch.com',
  /** How often the background worker checks for new alerts (Chrome allows 1 min at the least). */
  pollMinutes: 15,
  /** Feeds listed under "Data status", in this order. */
  feeds: ['flood', 'rain', 'waterlevel', 'radar', 'pm25', 'quakesTmd', 'quakesUsgs'] as const,
  /** A feed whose last good fetch is older than this (minutes) reads "not updating". Same limits as tools/monitor/config.json. */
  feedMaxAgeMinutes: { edge: 60, runner: 360 },
  /** Notification defaults (same as web push): every hazard, PM2.5 from the national standard. */
  defaultKinds: DEFAULT_CONFIG.push.kinds as PushKind[],
  pm25Choices: [25, 37.5, 50, 75],
  /** Same as WEB.map.driftCalmKmh: slower cloud-level wind reads as "rain barely moving". */
  driftCalmKmh: 5,
  /** Toolbar badge colours per severity (the web palette's strong tones). */
  badgeColor: { watch: '#704800', warn: '#9a3409', danger: '#8c0f28' },
} as const;

export type FeedKey = (typeof EXT.feeds)[number];
