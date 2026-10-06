import type { LatLng, LocalizedText } from './types';

export interface BBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface Region {
  id: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  name: LocalizedText;
  bbox: BBox;
  center: LatLng;
  zoom: number;
  /** OCHA/DOPA pcodes (TH10 = Bangkok); keep in sync with tools/boundaries/build.py. */
  provincePcodes: string[];
  /** Spelled exactly as Thai government feeds do; used to filter ThaiWater etc. */
  provincesTh: string[];
}

export const REGIONS = {
  'th-bangkok-metro': {
    id: 'th-bangkok-metro',
    country: 'TH',
    name: { th: 'กรุงเทพฯ และปริมณฑล', en: 'Greater Bangkok' },
    bbox: { minLat: 13.4, maxLat: 14.25, minLng: 99.85, maxLng: 101.0 },
    center: { lat: 13.7563, lng: 100.5018 },
    zoom: 11,
    provincePcodes: ['TH10', 'TH11', 'TH12', 'TH13', 'TH73', 'TH74'],
    provincesTh: ['กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'สมุทรสาคร', 'นครปฐม'],
  },
} as const satisfies Record<string, Region>;

export type RegionId = keyof typeof REGIONS;

export const ACTIVE_REGION_IDS: RegionId[] = ['th-bangkok-metro'];

export const activeRegions = (ids: readonly RegionId[] = ACTIVE_REGION_IDS): Region[] => ids.map((id) => REGIONS[id]);

export function inBBox({ lat, lng }: LatLng, b: BBox): boolean {
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

export const inRegions = (p: LatLng, regions: readonly Region[]) => regions.some((r) => inBBox(p, r.bbox));

export const regionProvinces = (regions: readonly Region[]) => new Set(regions.flatMap((r) => r.provincesTh));

export function regionFor(p: LatLng | null, regions: readonly Region[] = activeRegions()): Region {
  return (p && regions.find((r) => inBBox(p, r.bbox))) || regions[0]!;
}
