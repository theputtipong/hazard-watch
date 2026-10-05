import type { Severity } from '@hw/core';
import type { LayerKey } from './lib/layers';

export type TileProvider = 'stadia' | 'osm';
export interface TileSource {
  /** Leaflet URL templates; `{r}` becomes `@2x` on retina screens. */
  light: string;
  dark: string;
  attribution: string;
  maxZoom: number;
  /** Darken the light tiles with a CSS filter in dark mode (only for providers without a dark style). */
  invertInDark: boolean;
}

/**
 * Display settings for the web app. Alert thresholds and units are NOT here —
 * they live in packages/core/src/config.ts so the server and the web agree.
 */
export const WEB = {
  /** Public address of the site (link previews, absolute URLs). Change when a custom domain is added. */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://hazard.pdouvch.com',

  /** How often the dashboard re-fetches the snapshot. */
  refreshMs: 2 * 60_000,

  map: {
    /**
     * Base-map provider. Stadia Maps (free non-commercial plan) is the default; it authenticates
     * browsers by domain, so every public domain must be registered in the Stadia dashboard
     * (localhost works without it). NEXT_PUBLIC_TILE_PROVIDER=osm falls back to the OpenStreetMap
     * standard tiles — local dev only, tile.openstreetmap.org forbids heavy use.
     */
    tileProvider: (process.env.NEXT_PUBLIC_TILE_PROVIDER === 'osm' ? 'osm' : 'stadia') as TileProvider,
    tiles: {
      stadia: {
        light: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png',
        dark: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
        attribution:
          '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noopener">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
        maxZoom: 20,
        invertInDark: false,
      },
      osm: {
        light: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        dark: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
        maxZoom: 19,
        /** No dark style: light tiles are CSS-inverted in dark mode (.hw-tiles-invert in app/globals.css). */
        invertInDark: true,
      },
    } satisfies Record<TileProvider, TileSource>,
    /** Layers switched on when the page opens. */
    defaultLayers: { zones: true, radar: true, flood: true, water: true, pm25: false, cctv: false } satisfies Record<LayerKey, boolean>,
    defaultRadar: 'nkm',
    radarOpacity: 0.75,
    /** A radar frame older than this is labelled as not current. */
    radarStaleMinutes: 60, // ThaiWater frames normally arrive 35–50 min after the scan
    /** Fewer rain pixels than this in a frame = "no rain in radar range" (a few stray pixels are noise). */
    radarMinEchoPixels: 150,
    /** Opacity of markers whose reading is older than core config `staleAfterMinutes`. */
    staleOpacity: 0.4,
    /** Marker sizes in pixels (icons are square). Normal flood points stay small dots so problems stand out. */
    markerRadius: { floodNormal: 4 },
    iconSize: { you: 34, floodWatch: 26, floodWarn: 30, floodDanger: 34, pm25: 30, water: 30, cctv: 24 },
    /** Colour of the "you are here" person marker. */
    youColor: '#1f5fbf',
    /** Zoom used when jumping to the user's location with the locate button. */
    locateZoom: 14,
    /** Legend starts open on screens at least this wide (px); collapsed on phones. */
    legendOpenMinWidth: 640,
    /** CCTV icons appear only at this zoom or closer, so hundreds of cameras don't bury the hazards. */
    cctvMinZoom: 13,
    cctvColor: '#0f1b2d',
  },

  /** Marker/dot colours per severity (fills for cards are CSS tokens in app/globals.css). */
  severityColor: { ok: '#2e9e6a', watch: '#d9a400', warn: '#e2632b', danger: '#b4171e' } satisfies Record<Severity, string>,
  /** Same, for the colour-blind mode (Paul Tol "muted": blue / sand / rose / wine — also differ in lightness). */
  severityColorCvd: { ok: '#4477aa', watch: '#ddcc77', warn: '#cc6677', danger: '#882255' } satisfies Record<Severity, string>,
  /** Colour of flood points that are normal (kept grey so alerts stand out). */
  floodNormalColor: '#6b7787',

  /** Zone (province/district/subdistrict) shading. Status comes from packages/core config `zones`. */
  zones: {
    /** Fill opacity per status; zones with no sensors are left unfilled. */
    fillOpacity: { ok: 0.1, watch: 0.28, warn: 0.32, danger: 0.36 } satisfies Record<Severity, number>,
    borderColor: '#4a5668',
    borderWeight: 1.2,
    selectedWeight: 4,
    /** Padding (px) around an area when the map zooms to it. */
    fitPadding: 24,
  },

  cctv: {
    /** Wait after opening the source's main page before moving the tab to the camera (session must exist first). */
    sessionDelayMs: 2500,
  },

  /** How many nearby CCTV junctions to list. */
  nearbyCameras: 4,

  location: {
    /** Re-use a position up to this old instead of asking the device again. */
    maximumAgeMs: 10 * 60_000,
    timeoutMs: 15_000,
  },

  /** Choices offered for the personal PM2.5 alert level (µg/m³); the default is core config pm25.pushAt. */
  push: { pm25Choices: [25, 37.5, 50, 75] },

  /** Which area levels get a Share button (1 province, 2 เขต/อำเภอ, 3 แขวง/ตำบล). */
  share: { levels: [2, 3] as number[] },

  /** Read-aloud (Web Speech API). 1 = normal speed; lower is easier to follow. */
  speech: { rate: 0.95 },

  /** Days the chosen language is remembered. */
  langCookieDays: 365,

  /** Support link in the footer. */
  donateUrl: 'https://buymeacoffee.com/theputtipong',
} as const;
