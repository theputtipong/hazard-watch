import L from 'leaflet';
import type { Severity } from '@hw/core';
import { WEB } from '@/config';

/**
 * Map symbols. Each hazard has its own shape (not just colour) so they can be told apart at a glance:
 * person = you, water drop = flooding, number badge = PM2.5, camera = CCTV. Danger adds a "!" badge.
 */

const PERSON =
  '<circle cx="12" cy="6.5" r="3.2" fill="#fff"/><path d="M6.5 20.5v-4.2a5.5 5.5 0 0 1 11 0v4.2z" fill="#fff"/>';
const DROP = '<path d="M12 3.5c-3.2 4.3-5.5 7.6-5.5 10.4a5.5 5.5 0 0 0 11 0c0-2.8-2.3-6.1-5.5-10.4z" fill="#fff"/>';
const CAMERA =
  '<rect x="3" y="7.5" width="12" height="9" rx="2" fill="#fff"/><path d="M15.5 11l5.5-3v8l-5.5-3z" fill="#fff"/>';
const alertBadge = (color: string) =>
  `<span style="position:absolute;top:-4px;right:-4px;width:14px;height:14px;border-radius:50%;background:#fff;color:${color};font:700 11px/14px system-ui;text-align:center;box-shadow:0 0 0 1.5px ${color}">!</span>`;

const cache = new Map<string, L.DivIcon>();

/** Text on a solid severity fill: ink or white, whichever contrasts more (design system on-sev / on-sev-danger). */
function onFill(hex: string) {
  const lum = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const l = lum(hex);
  return (l + 0.05) / (lum('#0f1b2e') + 0.05) >= 1.05 / (l + 0.05) ? '#0f1b2e' : '#ffffff';
}

function round(key: string, size: number, background: string, inner: string, badge = '') {
  const hit = cache.get(key);
  if (hit) return hit;
  const icon = L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [size / 2, 0],
    html:
      `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:${background};` +
      `border:1.5px solid #fff;box-shadow:0 1px 4px rgba(15,27,45,.45);display:grid;place-items:center;box-sizing:border-box">` +
      `${inner}${badge}</div>`,
  });
  cache.set(key, icon);
  return icon;
}

const svg = (paths: string, px: number) => `<svg width="${px}" height="${px}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

export function youIcon() {
  const s = WEB.map.iconSize.you;
  return round('you', s, WEB.map.youColor, svg(PERSON, s * 0.62));
}

export function floodIcon(severity: Exclude<Severity, 'ok'>, colors: Record<Severity, string>) {
  const s = { watch: WEB.map.iconSize.floodWatch, warn: WEB.map.iconSize.floodWarn, danger: WEB.map.iconSize.floodDanger }[severity];
  const c = colors[severity];
  return round(`flood-${severity}-${c}`, s, c, svg(DROP, s * 0.6), severity === 'danger' ? alertBadge(colors.danger) : '');
}

export function pm25Icon(value: number, severity: Severity, colors: Record<Severity, string>) {
  const s = WEB.map.iconSize.pm25;
  const text = `<span style="color:${onFill(colors[severity])};font:700 ${value >= 100 ? 10 : 11}px/1 system-ui">${Math.round(value)}</span>`;
  const c = colors[severity];
  return round(`pm-${Math.round(value)}-${c}`, s, c, text, severity === 'danger' ? alertBadge(colors.danger) : '');
}

/** Water level: a rounded square (not a circle) with the % of bank-full, so it isn't confused with PM2.5. */
export function waterIcon(pct: number, severity: Severity, colors: Record<Severity, string>) {
  const s = WEB.map.iconSize.water;
  const key = `water-${Math.round(pct)}-${colors[severity]}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const icon = L.divIcon({
    className: '',
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
    tooltipAnchor: [s / 2, 0],
    html:
      `<div style="position:relative;width:${s}px;height:${s}px;border-radius:var(--radius-control);background:${colors[severity]};` +
      `border:1.5px solid #fff;box-shadow:0 1px 4px rgba(15,27,45,.45);display:grid;place-items:center;box-sizing:border-box;` +
      `color:${onFill(colors[severity])};font:700 ${pct >= 100 ? 9 : 10}px/1 system-ui">${Math.round(pct)}%` +
      `${severity === 'danger' ? alertBadge(colors.danger) : ''}</div>`,
  });
  cache.set(key, icon);
  return icon;
}

export function cctvIcon() {
  const s = WEB.map.iconSize.cctv;
  return round('cctv', s, WEB.map.cctvColor, svg(CAMERA, s * 0.66));
}

/** Small inline SVGs reused by the legend. */
export const LEGEND_GLYPH = { person: PERSON, drop: DROP, camera: CAMERA };
