'use client';

import { useCallback, useState } from 'react';
import { gibsTileUrl, gibsWmsParams, NASA_LAYERS, NASA_POINT_LAYERS, type NasaLayer, type NasaLayerId } from '@hw/core';
import { WEB } from '@/config';

/** Menu order: the hazard layers first, the plain photo last. */
export const NASA_RASTER_IDS: NasaLayerId[] = ['imergRain', 'flood', 'aod', 'fireWms', 'trueColor'];

export interface NasaLayerState {
  firms: boolean;
  events: boolean;
  /** At most one GIBS raster (see WEB.map.nasaRaster). */
  raster: NasaLayerId | null;
}

export const NASA_DEFAULT: NasaLayerState = {
  firms: NASA_POINT_LAYERS.firms.defaultOn,
  events: NASA_POINT_LAYERS.events.defaultOn,
  raster: WEB.map.nasaRaster,
};

export interface LeafletGibs {
  kind: 'tile' | 'wms';
  url: string;
  options: {
    maxNativeZoom: number;
    maxZoom: number;
    opacity: number;
    attribution: string;
  };
  /** WMS only. Lower-case keys: Leaflet sends its own lower-case defaults, and duplicate LAYERS/layers confuse the server. */
  params?: { layers: string; format: string; transparent: boolean; version: string; time: string };
}

/** Leaflet settings for a GIBS layer. maxNativeZoom matters: GIBS answers 400 one level above it, so Leaflet must overzoom. */
export function toLeaflet(l: NasaLayer, now = new Date()): LeafletGibs {
  const options = { maxNativeZoom: l.maxNativeZoom, maxZoom: WEB.map.openfreemap.maxZoom, opacity: l.opacity, attribution: l.attribution };
  if (l.service === 'wms') {
    const p = gibsWmsParams(l, now);
    // 1.3.0 is the version tested against GIBS (research §3); EPSG:3857 keeps x/y axis order there.
    const params = { layers: p.LAYERS ?? l.gibsLayer, format: p.FORMAT ?? 'image/png', transparent: true, version: '1.3.0', time: p.TIME ?? '' };
    return { kind: 'wms', url: gibsTileUrl(l, now), options, params };
  }
  return { kind: 'tile', url: gibsTileUrl(l, now), options };
}

/**
 * The day shown on the legend. WMS asks for an explicit day, so that one is exact. TIME=default lets GIBS pick its
 * newest day, which is usually yesterday (UTC) give or take one, so it is shown as approximate.
 */
export function gibsDataDate(l: NasaLayer, now = new Date()): { date: string; approx: boolean } {
  const day = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  return { date: l.service === 'wms' ? (gibsWmsParams(l, now).TIME ?? day) : day, approx: l.time === 'default' && l.service !== 'wms' };
}

const STORAGE_KEY = 'hw-nasa-layers';

function read(): NasaLayerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return NASA_DEFAULT;
    const v = JSON.parse(raw) as Partial<NasaLayerState>;
    return {
      firms: typeof v.firms === 'boolean' ? v.firms : NASA_DEFAULT.firms,
      events: typeof v.events === 'boolean' ? v.events : NASA_DEFAULT.events,
      // A layer id from an older build may be gone; drop it rather than ask GIBS for nothing.
      raster: v.raster && v.raster in NASA_LAYERS ? v.raster : null,
    };
  } catch {
    // Storage blocked or bad JSON: defaults for this visit.
    return NASA_DEFAULT;
  }
}

/** NASA layer choices, remembered on this device only. */
export function useNasaLayers() {
  const [state, setState] = useState<NasaLayerState>(read);
  const update = useCallback((change: (s: NasaLayerState) => NasaLayerState) => {
    setState((s) => {
      const next = change(s);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Not remembered, still applied.
      }
      return next;
    });
  }, []);
  return [state, update] as const;
}
