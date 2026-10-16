import { GIBS } from '@hw/core';
import { WEB } from '@/config';
import { API_BASE } from '@/lib/api';
import { PREFS_SCRIPT } from '@/lib/prefsScript';

const isDev = process.env.NODE_ENV === 'development';

const origin = (url: string) => new URL(url).origin;
const API = origin(API_BASE);
const VECTOR_TILES = origin(WEB.map.openfreemap.style.light);
// The raster layer is also the fallback when WebGL or the vector style fails, so it is always allowed.
const RASTER_TILES = origin(WEB.map.osm.url);
// NASA GIBS imagery loads as <img> tiles (WMTS and WMS on one host). FIRMS/EONET are not listed: the client only
// reads them from our snapshot, never from NASA directly.
const NASA_TILES = origin(GIBS.wmts);

let prefsHash: Promise<string> | undefined;

/** Hashed from the same string the layout renders, so editing the script cannot break the policy. */
function prefsScriptHash(): Promise<string> {
  prefsHash ??= crypto.subtle.digest('SHA-256', new TextEncoder().encode(PREFS_SCRIPT)).then((buf) => {
    const hash = btoa(String.fromCharCode(...new Uint8Array(buf)));
    return `'sha256-${hash}'`;
  });
  return prefsHash;
}

export function createNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

export async function contentSecurityPolicy(nonce: string): Promise<string> {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // Next.js reads the nonce from this header and puts it on its own scripts; 'strict-dynamic' lets
    // those load the chunks they import. 'self' is only a fallback for browsers without CSP3.
    'script-src': ["'self'", `'nonce-${nonce}'`, await prefsScriptHash(), "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // React SSR style="" attributes and Leaflet/MapLibre markup carry inline styles that cannot take a nonce.
    // No nonce here on purpose: a nonce would make browsers ignore 'unsafe-inline'.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', API, RASTER_TILES, NASA_TILES],
    'font-src': ["'self'"],
    // MapLibre fetches its style, vector tiles, glyphs and sprites.
    'connect-src': ["'self'", API, VECTOR_TILES],
    // MapLibre's worker is served from /_next/static (setWorkerUrl in vectorBaseMap.ts); the push service worker is /sw.js.
    'worker-src': ["'self'"],
    'child-src': ["'self'"],
    'frame-src': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'manifest-src': ["'self'"],
  };
  // No upgrade-insecure-requests: everything is already https, and it could interfere with the plain-http BMA camera tab.
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}
