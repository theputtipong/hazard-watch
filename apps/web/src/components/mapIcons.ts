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
const ALERT_BADGE =
  '<span style="position:absolute;top:-4px;right:-4px;width:14px;height:14px;border-radius:50%;background:#fff;color:#b4171e;font:700 11px/14px system-ui;text-align:center;box-shadow:0 0 0 1.5px #b4171e">!</span>';

const cache = new Map<string, L.DivIcon>();

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
      `border:2.5px solid #fff;box-shadow:0 1px 4px rgba(15,27,45,.45);display:grid;place-items:center;box-sizing:border-box">` +
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

export function floodIcon(severity: Exclude<Severity, 'ok'>) {
  const s = { watch: WEB.map.iconSize.floodWatch, warn: WEB.map.iconSize.floodWarn, danger: WEB.map.iconSize.floodDanger }[severity];
  return round(`flood-${severity}`, s, WEB.severityColor[severity], svg(DROP, s * 0.6), severity === 'danger' ? ALERT_BADGE : '');
}

export function pm25Icon(value: number, severity: Severity) {
  const s = WEB.map.iconSize.pm25;
  const text = `<span style="color:#fff;font:700 ${value >= 100 ? 10 : 11}px/1 system-ui">${Math.round(value)}</span>`;
  return round(`pm-${Math.round(value)}-${severity}`, s, WEB.severityColor[severity], text, severity === 'danger' ? ALERT_BADGE : '');
}

export function cctvIcon() {
  const s = WEB.map.iconSize.cctv;
  return round('cctv', s, WEB.map.cctvColor, svg(CAMERA, s * 0.66));
}

/** Small inline SVGs reused by the legend. */
export const LEGEND_GLYPH = { person: PERSON, drop: DROP, camera: CAMERA };
