import type { LatLng, WeatherNow } from '@hw/core';
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
    observedAt: new Date(`${c.time}:00+07:00`).toISOString(),
    temperatureC: c.temperature_2m,
    humidityPct: c.relative_humidity_2m,
    precipitationMm: c.precipitation,
    weatherCode: c.weather_code,
  };
}

/** Called per user location (not by cron); round coordinates so responses cache well. */
export async function fetchWeather(ctx: AdapterContext, location: LatLng): Promise<WeatherNow> {
  const lat = location.lat.toFixed(2);
  const lng = location.lng.toFixed(2);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    '&current=temperature_2m,relative_humidity_2m,precipitation,weather_code&timezone=Asia%2FBangkok';
  return parseOpenMeteo(await getJson(ctx, url), { lat: Number(lat), lng: Number(lng) });
}
