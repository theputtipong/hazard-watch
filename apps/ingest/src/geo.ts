import { buildZoneIndex, zoneAt, type LatLng, type ZoneFeature, type ZoneIndex } from '@hw/core';
// The lite file (same ids/props, coarser outlines) keeps 928 districts inside the Worker bundle and parse budget.
import districtsFile from '../../web/public/geo/districts-lite.json';

/** Every district nationwide; module scope, so it is parsed and indexed once per isolate. */
export const DISTRICTS = (districtsFile as unknown as { features: ZoneFeature[] }).features;
/** Grid index: a point lookup checks a few candidates instead of all 928 polygons. */
export const DISTRICT_INDEX: ZoneIndex = buildZoneIndex(DISTRICTS);
export const DISTRICT_IDS = new Set(DISTRICTS.map((d) => d.properties.id));

const BY_ID = new Map(DISTRICTS.map((d) => [d.properties.id, d]));

export const findDistrict = (id: string): ZoneFeature | null => BY_ID.get(id) ?? null;
export const districtAt = (p: LatLng): ZoneFeature | null => zoneAt(DISTRICT_INDEX, p);
