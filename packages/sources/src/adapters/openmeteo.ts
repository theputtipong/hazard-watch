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
    wind_speed_10m?: number | null;
    wind_direction_10m?: number | null;
    wind_gusts_10m?: number | null;
    wind_speed_700hPa?: number | null;
    wind_direction_700hPa?: number | null;
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
    windSpeedKmh: c.wind_speed_10m ?? null,
    windFromDeg: c.wind_direction_10m ?? null,
    windGustKmh: c.wind_gusts_10m ?? null,
    cloudWindSpeedKmh: c.wind_speed_700hPa ?? null,
    cloudWindFromDeg: c.wind_direction_700hPa ?? null,
  };
}

/** Called per user location: coordinates are rounded so responses cache well. */
export async function fetchWeather(ctx: AdapterContext, location: LatLng): Promise<WeatherNow> {
  const lat = location.lat.toFixed(REQUEST.weatherCoordDecimals);
  const lng = location.lng.toFixed(REQUEST.weatherCoordDecimals);
  const url =
    `${ENDPOINTS.openMeteo}?latitude=${lat}&longitude=${lng}` +
    '&current=temperature_2m,relative_humidity_2m,precipitation,weather_code' +
    // km/h and degrees are Open-Meteo's defaults; 700 hPa is the usual steering level for rain cells.
    ',wind_speed_10m,wind_direction_10m,wind_gusts_10m,wind_speed_700hPa,wind_direction_700hPa' +
    '&timezone=Asia%2FBangkok';
  return parseOpenMeteo(await getJson(ctx, url), { lat: Number(lat), lng: Number(lng) });
}
