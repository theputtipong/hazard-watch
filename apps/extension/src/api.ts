import type { DashboardSnapshot, LatLng, WeatherNow } from '@hw/core';
import { EXT } from './config';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${EXT.apiBase}${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const fetchSnapshot = () => getJson<DashboardSnapshot>('/v1/snapshot');
export const fetchWeather = ({ lat, lng }: LatLng) => getJson<WeatherNow>(`/v1/weather?lat=${lat.toFixed(2)}&lng=${lng.toFixed(2)}`);

/** The dashboard opened on the person's district. */
export const siteLink = (lang: string, districtId?: string) => `${EXT.siteUrl}/${lang}${districtId ? `?area=${districtId}` : ''}`;
