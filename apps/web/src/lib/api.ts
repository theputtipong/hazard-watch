import type { DashboardSnapshot, LatLng, WeatherNow } from '@hw/core';

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? (process.env.NODE_ENV === 'production' ? 'https://api.hazard.pdouvch.com' : 'http://localhost:8787');

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json() as Promise<T>;
}

export const fetchSnapshot = () => getJson<DashboardSnapshot>('/v1/snapshot');

export const fetchWeather = ({ lat, lng }: LatLng) =>
  getJson<WeatherNow>(`/v1/weather?lat=${lat.toFixed(2)}&lng=${lng.toFixed(2)}`);

/** `time` busts the browser cache when a new frame arrives. */
export const radarImageUrl = (radarId: string, time?: string) =>
  `${API_BASE}/v1/radar/${radarId}${time ? `?t=${encodeURIComponent(time)}` : ''}`;
