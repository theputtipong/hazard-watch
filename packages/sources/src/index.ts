export * from './http';
export * from './adapters/air4thai';
export * from './adapters/bma';
export * from './adapters/quakes';
export * from './adapters/thaiwater';
export * from './adapters/cctv';
export * from './adapters/openmeteo';

import { air4thai } from './adapters/air4thai';
import { bmaFlood, bmaRain } from './adapters/bma';
import { bmaTrafficCameras } from './adapters/cctv';
import { tmdQuakes, usgsQuakes } from './adapters/quakes';
import { thaiwaterLevels, thaiwaterRadars } from './adapters/thaiwater';

/**
 * Feeds grouped by where they can be fetched from.
 * `edge`: works from Cloudflare Workers. `runner`: blocked there, fetched by GitHub Actions instead.
 */
export const FEEDS = {
  edge: { pm25: air4thai, quakesUsgs: usgsQuakes, quakesTmd: tmdQuakes },
  runner: { flood: bmaFlood, rain: bmaRain, waterlevel: thaiwaterLevels, radar: thaiwaterRadars, cctv: bmaTrafficCameras },
} as const;

export type EdgeFeed = keyof typeof FEEDS.edge;
export type RunnerFeed = keyof typeof FEEDS.runner;
export type FeedName = EdgeFeed | RunnerFeed;
