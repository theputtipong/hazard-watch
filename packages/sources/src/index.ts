export * from './http';
export * from './endpoints';
export * from './adapters/air4thai';
export * from './adapters/bma';
export * from './adapters/quakes';
export * from './adapters/thaiwater';
export * from './adapters/cctv';
export * from './adapters/openmeteo';
export * from './adapters/firms';
export * from './adapters/eonet';

import { air4thai } from './adapters/air4thai';
import { bmaFlood, bmaRain } from './adapters/bma';
import { bmaTrafficCameras } from './adapters/cctv';
import { eonetEvents } from './adapters/eonet';
import { firmsFires } from './adapters/firms';
import { tmdQuakes, usgsQuakes } from './adapters/quakes';
import { thaiwaterLevels, thaiwaterRadars } from './adapters/thaiwater';

/** `edge`: fetchable from Cloudflare Workers. `runner`: blocked there, fetched by GitHub Actions. */
export const FEEDS = {
  edge: { pm25: air4thai, quakesUsgs: usgsQuakes, quakesTmd: tmdQuakes },
  runner: {
    flood: bmaFlood,
    rain: bmaRain,
    waterlevel: thaiwaterLevels,
    radar: thaiwaterRadars,
    cctv: bmaTrafficCameras,
    // NASA hosts are untested from Cloudflare egress, and the FIRMS CSVs are too big to parse in 10 ms CPU.
    fires: firmsFires,
    events: eonetEvents,
  },
} as const;

export type EdgeFeed = keyof typeof FEEDS.edge;
export type RunnerFeed = keyof typeof FEEDS.runner;
export type FeedName = EdgeFeed | RunnerFeed;
