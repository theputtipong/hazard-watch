/** Load only via import(): MapLibre is large and browser-only, so it stays out of SSR and the initial bundle. */
import 'maplibre-gl/dist/maplibre-gl.css';
import L from 'leaflet';
import { setWorkerUrl, type Map as GlMap, type ExpressionSpecification } from 'maplibre-gl';
import '@maplibre/maplibre-gl-leaflet';
import type { Lang } from '@hw/core/i18n';
import { WEB } from '@/config';

// MapLibre 6 cannot locate its worker from inside a bundle; this form makes Next emit it as a hashed asset.
setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString());

export interface VectorBaseMap {
  layer: L.MaplibreGL;
  setTheme(dark: boolean): void;
  setLang(lang: Lang): void;
}

/** OpenMapTiles `name:xx` in the page language, falling back to the local `name`. */
const labelExpr = (lang: Lang): ExpressionSpecification => ['coalesce', ['get', `name:${lang}`], ['get', 'name']];

/** Name-bearing symbol layers (not shields, which show `ref`). */
function applyLabels(gl: GlMap, lang: Lang) {
  for (const layer of gl.getStyle().layers) {
    if (layer.type !== 'symbol') continue;
    const field = layer.layout?.['text-field'];
    if (field === undefined || !JSON.stringify(field).includes('"name')) continue;
    gl.setLayoutProperty(layer.id, 'text-field', labelExpr(lang));
  }
}

export function createVectorBaseMap(dark: boolean, lang: Lang, onFail?: () => void): VectorBaseMap {
  const src = WEB.map.openfreemap;
  let current = lang;
  let style = dark ? src.style.dark : src.style.light;
  const layer = L.maplibreGL({
    style,
    maxZoom: src.maxZoom,
    // Leaflet shows this string; MapLibre's own attribution control is off.
    attributionControl: { customAttribution: src.attribution },
  });
  // The GL map exists only once the layer is on a Leaflet map.
  layer.on('add', () => {
    const gl = layer.getMaplibreMap();
    gl.on('style.load', () => applyLabels(gl, current));
    let loaded = false;
    gl.once('load', () => (loaded = true));
    gl.on('error', () => {
      if (!loaded) onFail?.();
    });
  });
  return {
    layer,
    setTheme(next) {
      const url = next ? src.style.dark : src.style.light;
      if (url === style) return;
      style = url;
      layer.getMaplibreMap()?.setStyle(url, { diff: false });
    },
    setLang(next) {
      if (next === current) return;
      current = next;
      const gl = layer.getMaplibreMap();
      if (gl?.isStyleLoaded()) applyLabels(gl, next);
    },
  };
}
