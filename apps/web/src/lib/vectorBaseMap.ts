/**
 * OpenFreeMap vector base map drawn by MapLibre GL inside Leaflet (tile pane, under every overlay).
 * Imported only with `import()` from the client-only map, so MapLibre (large, browser-only) stays
 * out of SSR and out of the initial bundle.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import L from 'leaflet';
import type { Map as GlMap, ExpressionSpecification } from 'maplibre-gl';
import '@maplibre/maplibre-gl-leaflet';
import type { Lang } from '@hw/core/i18n';
import { WEB } from '@/config';

export interface VectorBaseMap {
  layer: L.MaplibreGL;
  setTheme(dark: boolean): void;
  setLang(lang: Lang): void;
}

/** Label in the page language, falling back to the local name (OpenMapTiles `name:xx` / `name`). */
const labelExpr = (lang: Lang): ExpressionSpecification => ['coalesce', ['get', `name:${lang}`], ['get', 'name']];

/** Symbol layers that show a place/road name (not shields, which show `ref`). */
function applyLabels(gl: GlMap, lang: Lang) {
  for (const layer of gl.getStyle().layers) {
    if (layer.type !== 'symbol') continue;
    const field = layer.layout?.['text-field'];
    if (field === undefined || !JSON.stringify(field).includes('"name')) continue;
    gl.setLayoutProperty(layer.id, 'text-field', labelExpr(lang));
  }
}

export function createVectorBaseMap(dark: boolean, lang: Lang): VectorBaseMap {
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
