import { BMA_URLS, relayPath, type DashboardSnapshot, type LatLng, type RelayKind, type WeatherNow } from '@hw/core';
import { EXT } from './config';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${EXT.apiBase}${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const fetchSnapshot = () => getJson<DashboardSnapshot>('/v1/snapshot');
export const fetchWeather = ({ lat, lng }: LatLng) => getJson<WeatherNow>(`/v1/weather?lat=${lat.toFixed(2)}&lng=${lng.toFixed(2)}`);

/** Raw BMA JSON; works only from Thai IPs, which is why the extension relays it. */
export async function fetchBma(kind: RelayKind): Promise<unknown> {
  const res = await fetch(BMA_URLS[kind], {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`bma ${kind}: HTTP ${res.status}`);
  return res.json();
}

/** Hands the raw BMA body to the API, which parses and validates it server side. */
export async function relayBma(kind: RelayKind, raw: unknown): Promise<void> {
  const path = relayPath(kind);
  const res = await fetch(`${EXT.apiBase}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(raw),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
}

export const siteLink = (lang: string, districtId?: string) => `${EXT.siteUrl}/${lang}${districtId ? `?area=${districtId}` : ''}`;
