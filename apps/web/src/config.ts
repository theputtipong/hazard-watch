import type { Severity } from '@hw/core';
import type { LayerKey } from './lib/layers';

/**
 * Display settings for the web app. Alert thresholds and units are NOT here —
 * they live in packages/core/src/config.ts so the server and the web agree.
 */
export const WEB = {
  /** How often the dashboard re-fetches the snapshot. */
  refreshMs: 2 * 60_000,

  map: {
    /** ⚠️ tile.openstreetmap.org forbids heavy use; switch provider before a public launch (TODO.md). */
    tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    /** Layers switched on when the page opens. */
    defaultLayers: { radar: true, flood: true, pm25: false, cctv: false } satisfies Record<LayerKey, boolean>,
    defaultRadar: 'nkm',
    radarOpacity: 0.6,
    /** Marker sizes in pixels. */
    markerRadius: { floodNormal: 4, floodAlert: 8, pm25: 10, cctv: 5, you: 9 },
  },

  /** Marker/dot colours per severity (fills for cards are CSS tokens in app/globals.css). */
  severityColor: { ok: '#2e9e6a', watch: '#d9a400', warn: '#e2632b', danger: '#b4171e' } satisfies Record<Severity, string>,
  /** Colour of flood points that are normal (kept grey so alerts stand out). */
  floodNormalColor: '#6b7787',

  /** How many nearby CCTV junctions to list. */
  nearbyCameras: 4,

  location: {
    /** Re-use a position up to this old instead of asking the device again. */
    maximumAgeMs: 10 * 60_000,
    timeoutMs: 15_000,
  },

  /** Days the chosen language is remembered. */
  langCookieDays: 365,

  /** Support link in the footer. */
  donateUrl: 'https://buymeacoffee.com/theputtipong',
} as const;
