import { DEFAULT_CONFIG, type Severity } from '@hw/core';
import { palettes, type Palette } from '@hw/tokens';
import type { LayerKey } from './lib/layers';

/** Leaflet and inline SVG need real colour values, so these come from the same tokens as the CSS sev-* variables. */
const severityOf = (p: Palette): Record<Severity, string> => ({
  ok: p.sevNormal,
  watch: p.sevWatch,
  warn: p.sevWarning,
  danger: p.sevDanger,
});

export type TileProvider = 'openfreemap' | 'osm';

export interface VectorTileSource {
  style: { light: string; dark: string };
  maxZoom: number;
  attribution: string;
}

export interface RasterTileSource {
  url: string;
  attribution: string;
  maxZoom: number;
  invertInDark: boolean;
}

const OSM_COPYRIGHT = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

/** Thresholds and units live in packages/core config so server and web agree. */
export const WEB = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://hazard.pdouvch.com',

  refreshMs: 2 * 60_000,

  map: {
    /** OSM raster is emergency/dev only: tile.openstreetmap.org forbids heavy use. */
    tileProvider: (process.env.NEXT_PUBLIC_TILE_PROVIDER === 'osm' ? 'osm' : 'openfreemap') as TileProvider,
    openfreemap: {
      /** Positron: quiet grey basemap so coloured zones/radar/pins stand out. */
      style: { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' },
      /** Tile data stops at z14; closer zooms over-zoom the vectors. */
      maxZoom: 19,
      attribution: `<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from ${OSM_COPYRIGHT}`,
    } satisfies VectorTileSource,
    osm: {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: `&copy; ${OSM_COPYRIGHT} contributors`,
      maxZoom: 19,
      /** No dark style: tiles are CSS-inverted in dark mode (.hw-tiles-invert). */
      invertInDark: true,
    } satisfies RasterTileSource,
    defaultLayers: { zones: true, radar: true, flood: true, water: true, pm25: false, cctv: false } satisfies Record<LayerKey, boolean>,
    defaultRadar: 'nkm',
    radarOpacity: 0.75,
    radarStaleMinutes: 60, // ThaiWater frames normally arrive 35–50 min after the scan
    /** Below this many rain pixels a frame counts as no rain (stray pixels are noise). */
    radarMinEchoPixels: 150,
    /** 700 hPa wind below this: radar badge says rain is barely moving instead of a direction. */
    driftCalmKmh: 5,
    staleOpacity: 0.4,
    /** Normal flood points stay small dots so problems stand out. */
    markerRadius: { floodNormal: 4 },
    iconSize: { you: 34, floodWatch: 26, floodWarn: 30, floodDanger: 34, pm25: 30, water: 30, cctv: 24 },
    youColor: palettes.light.accent,
    locateZoom: 14,
    legendOpenMinWidth: 640,
    /** Hidden below this zoom so hundreds of cameras don't bury the hazards. */
    cctvMinZoom: 13,
    cctvColor: palettes.light.ink,
  },

  /** Normal is grey so only problems get colour. */
  severityColor: { light: severityOf(palettes.light), dark: severityOf(palettes.dark) },
  /** Paul Tol "muted" palette for colour-blind mode (hues also differ in lightness). */
  severityColorCvd: severityOf(palettes.lightCvd),
  floodNormalColor: palettes.light.sevNormal,

  zones: {
    fillOpacity: { ok: 0.1, watch: 0.28, warn: 0.32, danger: 0.36 } satisfies Record<Severity, number>,
    borderColor: palettes.light.inkMuted,
    borderWeight: 1.2,
    selectedWeight: 4,
    fitPadding: 24,
  },

  cctv: {
    /** The source's main page must be opened first to create a session. */
    sessionDelayMs: 2500,
  },

  nearbyCameras: 4,

  location: {
    maximumAgeMs: 10 * 60_000,
    timeoutMs: 15_000,
  },

  push: {
    pm25Choices: [25, 37.5, 50, 75],
    /** From core config: the server only accepts these values. */
    quakeMagnitudeChoices: DEFAULT_CONFIG.push.quakeChoices.minMagnitude,
    quakeDistanceChoices: DEFAULT_CONFIG.push.quakeChoices.maxDistanceKm,
  },

  /** Area levels: 1 province, 2 เขต/อำเภอ, 3 แขวง/ตำบล. */
  share: { levels: [2, 3] as number[] },

  /** Slightly below 1 (normal) so it is easier to follow. */
  speech: { rate: 0.95 },

  langCookieDays: 365,

  donateUrl: 'https://buymeacoffee.com/theputtipong',
} as const;
