import type { LatLng, WeatherNow } from '@hw/core';
import { ENDPOINTS, REQUEST } from '../endpoints';
import { getJson, type AdapterContext } from '../http';

interface OpenMeteoResponse {
  current: {
    time: string;
    temperature_2m: number | null;
    relative_humidity_2m: number | null;
    precipitation: number | null;
    weather_code: number | null;
  };
}

export function parseOpenMeteo(body: OpenMeteoResponse, location: LatLng): WeatherNow {
  const c = body.current;
  return {
    source: 'open-meteo',
    location,
    // Requested with timezone=Asia/Bangkok, so the time is local without offset.
    observedAt: new Date(`${c.time}:00${REQUEST.thaiOffset}`).toISOString(),
    temperatureC: c.temperature_2m,
    humidityPct: c.relative_humidity_2m,
    precipitationMm: c.precipitation,
    weatherCode: c.weather_code,
  };
}

/** Called per user location (not by cron); round coordinates so responses cache well. */
export async function fetchWeather(ctx: AdapterContext, location: LatLng): Promise<WeatherNow> {
  const lat = location.lat.toFixed(REQUEST.weatherCoordDecimals);
  const lng = location.lng.toFixed(REQUEST.weatherCoordDecimals);
  const url =
    `${ENDPOINTS.openMeteo}?latitude=${lat}&longitude=${lng}` +
    '&current=temperature_2m,relative_humidity_2m,precipitation,weather_code&timezone=Asia%2FBangkok';
  return parseOpenMeteo(await getJson(ctx, url), { lat: Number(lat), lng: Number(lng) });
}
