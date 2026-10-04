import { inRegions, pm25Severity, type Observation } from '@hw/core';
import { ENDPOINTS } from '../endpoints';
import { getJson, settle, type AdapterContext } from '../http';
import { bkkLocal } from '../time';


interface Station {
  stationID: string;
  nameTH: string;
  nameEN: string;
  areaTH: string;
  areaEN: string;
  lat: string;
  long: string;
  AQILast: { date: string; time: string; PM25: { value: string } };
}

export function parseAir4Thai(body: { stations: Station[] }, ctx: AdapterContext): Observation[] {
  return body.stations
    .map((s) => ({ s, location: { lat: Number(s.lat), lng: Number(s.long) } }))
    .filter(({ location }) => inRegions(location, ctx.regions))
    .map(({ s, location }) => {
      const raw = Number(s.AQILast.PM25.value);
      const value = Number.isFinite(raw) && raw >= 0 ? raw : null;
      return {
        id: `air4thai:${s.stationID}`,
        kind: 'pm25',
        source: 'air4thai',
        name: { th: s.nameTH, en: s.nameEN },
        location,
        observedAt: bkkLocal(s.AQILast.date, s.AQILast.time),
        value,
        unit: ctx.config.units.pm25,
        severity: value === null ? 'ok' : pm25Severity(value, ctx.config),
        offline: value === null,
        extra: { area: s.areaTH },
      } satisfies Observation;
    });
}

export const air4thai = (ctx: AdapterContext) =>
  settle('air4thai', ctx, async () => parseAir4Thai(await getJson(ctx, ENDPOINTS.air4thai), ctx));
