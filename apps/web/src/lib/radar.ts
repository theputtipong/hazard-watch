import { RADARS, type LatLng, type RadarSpec } from '@hw/core';

const area = (r: RadarSpec) => (r.bounds[1][0] - r.bounds[0][0]) * (r.bounds[1][1] - r.bounds[0][1]);
const covers = (r: RadarSpec, p: LatLng) => p.lat >= r.bounds[0][0] && p.lat <= r.bounds[1][0] && p.lng >= r.bounds[0][1] && p.lng <= r.bounds[1][1];

/** Prefers the most detailed radar (smallest area) that covers the point. */
export function radarFor(p: LatLng, available: string[], fallback: string): string {
  const candidates = available.map((id) => RADARS[id]).filter((r): r is RadarSpec => !!r && covers(r, p));
  candidates.sort((a, b) => area(a) - area(b));
  return candidates[0]?.id ?? (available.includes(fallback) ? fallback : (available[0] ?? fallback));
}

export function radarGroups(available: string[], lang: 'th' | 'en') {
  const order: RadarSpec['agency'][] = ['bma', 'tmd', 'drraa'];
  return order
    .map((agency) => ({
      agency,
      radars: available
        .map((id) => RADARS[id])
        .filter((r): r is RadarSpec => !!r && r.agency === agency)
        .sort((a, b) => a.name[lang].localeCompare(b.name[lang], lang)),
    }))
    .filter((g) => g.radars.length);
}
