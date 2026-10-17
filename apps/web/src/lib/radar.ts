import { distanceKm, RADARS, SOURCE_META, type LatLng, type RadarSpec, type SourceMeta } from '@hw/core';

/**
 * Who to credit (and link) for a radar image. Images reach us through ThaiWater; TMD and BMA radars link to the agency
 * site that publishes them. DRRAA has no entry in SOURCE_META yet, so its images are credited to ThaiWater, the host.
 */
const RADAR_CREDIT: Record<RadarSpec['agency'], SourceMeta> = {
  tmd: SOURCE_META['tmd-radar'],
  bma: SOURCE_META['bma-rain'],
  drraa: SOURCE_META.thaiwater,
};

export const radarCredit = (radarId: string): SourceMeta | null => {
  const r = RADARS[radarId];
  return r ? RADAR_CREDIT[r.agency] : null;
};

const area = (r: RadarSpec) => (r.bounds[1][0] - r.bounds[0][0]) * (r.bounds[1][1] - r.bounds[0][1]);

/** Images are framed on the radar's crosshair; a full-height side panel (legend) is cut off before taking the centre. */
function site(r: RadarSpec): LatLng {
  const [width, height] = r.size;
  const panel = r.ignore.find(([x, y, w, h]) => y === 0 && h >= height && x + w >= width && x > 0);
  const mapWidth = panel ? panel[0] : width;
  const [[south, west], [north, east]] = r.bounds;
  return { lat: (south + north) / 2, lng: west + ((east - west) * mapWidth) / 2 / width };
}
const covers = (r: RadarSpec, p: LatLng) => p.lat >= r.bounds[0][0] && p.lat <= r.bounds[1][0] && p.lng >= r.bounds[0][1] && p.lng <= r.bounds[1][1];

/**
 * The radar nearest the point among those whose image covers it (closer = lower beam, finer echoes);
 * outside every image, the nearest radar at all so a province far from Bangkok doesn't open on Bangkok.
 */
export function radarFor(p: LatLng, available: string[], fallback: string): string {
  const radars = available.map((id) => RADARS[id]).filter((r): r is RadarSpec => !!r);
  // Same site at two ranges (ubn120/ubn240): the tighter image wins.
  const byDistance = (list: RadarSpec[]) =>
    list
      .map((r) => ({ r, km: Math.round(distanceKm(p, site(r))) }))
      .sort((a, b) => a.km - b.km || area(a.r) - area(b.r))[0]?.r.id;
  return byDistance(radars.filter((r) => covers(r, p))) ?? byDistance(radars) ?? fallback;
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
