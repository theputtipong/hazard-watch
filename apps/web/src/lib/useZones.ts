'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildZoneIndex,
  DEFAULT_CONFIG,
  groupByZone,
  inZone,
  REGIONS,
  summarizeZone,
  zoneAt,
  type LatLng,
  type Observation,
  type ZoneFeature,
  type ZoneIndex,
  type ZoneSummary,
} from '@hw/core';

/** Static boundary files built by tools/boundaries/build.py into public/geo. */
type Tier = 'provinces' | 'districts' | 'subdistricts';

/** Only Greater Bangkok has subdistrict boundaries; known up front so a district can show "›" before they load. */
const SUBDISTRICT_PCODES: ReadonlySet<string> = new Set(REGIONS['th-bangkok-metro'].provincePcodes);
export const hasSubdistricts = (id: string) => SUBDISTRICT_PCODES.has(id.slice(0, 4));

// Module-level so remounts and other hooks share one download per file. A failed fetch is forgotten so it can retry.
const cache: Partial<Record<Tier, Promise<ZoneFeature[]>>> = {};
function loadTier(tier: Tier): Promise<ZoneFeature[]> {
  cache[tier] ??= fetch(`/geo/${tier}.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`${tier}: ${r.status}`);
      return r.json() as Promise<{ features: ZoneFeature[] }>;
    })
    .then((f) => f.features)
    .catch((e: unknown) => {
      delete cache[tier];
      throw e;
    });
  return cache[tier];
}

function levelOf(id: string): 1 | 2 | 3 {
  if (id.length >= 8) return 3;
  return id.length >= 6 ? 2 : 1;
}
/** Ids nest by prefix: TH10 province → TH1028 district → TH102803 subdistrict. */
const chainOf = (id: string) => [4, 6, 8].slice(0, levelOf(id)).map((n) => id.slice(0, n));

/** Tiers needed to show this id (and to know whether it has children). */
function tiersFor(id: string): Tier[] {
  const level = levelOf(id);
  if (level === 1) return ['districts'];
  return hasSubdistricts(id) ? ['districts', 'subdistricts'] : ['districts'];
}

interface ZoneData {
  byId: Map<string, ZoneFeature>;
  children: Map<string | null, ZoneFeature[]>;
  provinceIndex: ZoneIndex;
  districtIndex: ZoneIndex | null;
  districts: ZoneFeature[] | null;
}

function buildData(loaded: Partial<Record<Tier, ZoneFeature[]>>): ZoneData | null {
  if (!loaded.provinces) return null;
  const all = [...loaded.provinces, ...(loaded.districts ?? []), ...(loaded.subdistricts ?? [])];
  const byId = new Map(all.map((z) => [z.properties.id, z]));
  const children = new Map<string | null, ZoneFeature[]>();
  for (const z of all) {
    const key = z.properties.level === 1 ? null : z.properties.parent;
    const list = children.get(key);
    if (list) list.push(z);
    else children.set(key, [z]);
  }
  return {
    byId,
    children,
    // Coarser cells for provinces: their bboxes span degrees, so 0.1° would register each in hundreds of cells.
    provinceIndex: buildZoneIndex(loaded.provinces, 0.5),
    districtIndex: loaded.districts ? buildZoneIndex(loaded.districts) : null,
    districts: loaded.districts ?? null,
  };
}

export interface ZoneView {
  ready: boolean;
  /** A boundary file needed for the current view is still downloading. */
  loading: boolean;
  path: ZoneFeature[];
  visible: ZoneFeature[];
  selected: ZoneFeature | null;
  summaries: Map<string, ZoneSummary>;
  focusSummary: ZoneSummary;
  hasChildren: (id: string) => boolean;
  /** Computed on the device; the point is never sent anywhere. Districts must be loaded (see `locatedAt`). */
  zonesAt: (p: LatLng) => { district: ZoneFeature | null; subdistrict: ZoneFeature | null };
  /** Province containing the point (provinces load first, so this works as soon as `ready`). */
  provinceAt: (p: LatLng) => ZoneFeature | null;
  byId: (id: string) => ZoneFeature | null;
  provinces: ZoneFeature[];
  /** All 928 districts once loaded (for search); call `loadDistricts` to start the download. */
  districts: ZoneFeature[] | null;
  loadDistricts: () => void;
  open: (id: string) => void;
  /** Jump straight to any zone (search result): drills into its parents and selects it. */
  pick: (id: string) => void;
  goTo: (depth: number) => void;
  back: () => void;
}

/**
 * Provinces load first (238 KB) so the picker shows at once; districts (1.2 MB) load only when needed:
 * a province is opened, the start area is below province level, the device is located, or search starts.
 * Subdistricts load only for Greater Bangkok, the one place that has them.
 */
export function useZones(
  readings: Observation[],
  initialArea?: string | null,
  fallbackArea?: () => string | null,
  locatedAt?: LatLng | null,
): ZoneView {
  const [loaded, setLoaded] = useState<Partial<Record<Tier, ZoneFeature[]>>>({});
  const [failed, setFailed] = useState(false);
  const [rawPath, setPathIds] = useState<string[]>([]);
  const [rawSelected, setSelectedId] = useState<string | null>(null);
  const requested = useRef(new Set<Tier>());

  const need = useCallback((tiers: Tier[]) => {
    for (const tier of tiers) {
      if (requested.current.has(tier)) continue;
      requested.current.add(tier);
      loadTier(tier)
        .then((features) => setLoaded((l) => ({ ...l, [tier]: features })))
        .catch(() => {
          requested.current.delete(tier);
          if (tier === 'provinces') setFailed(true);
        });
    }
  }, []);

  const data = useMemo(() => buildData(loaded), [loaded]);

  // Place the start area by id alone (no geometry needed yet), then fetch what it needs.
  useEffect(() => {
    need(['provinces']);
    const startId = initialArea ?? fallbackArea?.() ?? null;
    if (!startId) return;
    need(tiersFor(startId));
    const chain = chainOf(startId);
    const leaf = levelOf(startId) === 3 || (levelOf(startId) === 2 && !hasSubdistricts(startId));
    // Placed together with the first boundaries so the view never flashes an empty path.
    loadTier('provinces')
      .then(() => {
        setPathIds(leaf ? chain.slice(0, -1) : chain);
        setSelectedId(leaf ? startId : null);
      })
      .catch(() => undefined);
    // Only the first load uses the shared link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An id missing from the files (stale saved pick) falls back to its deepest existing ancestor,
  // judged only once the file that would hold it has arrived.
  const { pathIds, selectedId } = useMemo(() => {
    if (!data) return { pathIds: rawPath, selectedId: rawSelected };
    const known = (id: string) =>
      levelOf(id) === 1 || (levelOf(id) === 2 ? !!loaded.districts : !hasSubdistricts(id) || !!loaded.subdistricts);
    const ids = [...rawPath, ...(rawSelected ? [rawSelected] : [])];
    const bad = ids.findIndex((id) => known(id) && !data.byId.has(id));
    if (bad === -1) return { pathIds: rawPath, selectedId: rawSelected };
    return { pathIds: rawPath.slice(0, bad), selectedId: null };
  }, [data, loaded, rawPath, rawSelected]);

  // Located: districts are needed to name the area; subdistricts only inside Greater Bangkok.
  useEffect(() => {
    if (!locatedAt || !data) return;
    need(['districts']);
    const province = zoneAt(data.provinceIndex, locatedAt);
    if (province && hasSubdistricts(province.properties.id)) need(['subdistricts']);
  }, [locatedAt, data, need]);

  const parentId = pathIds.at(-1) ?? null;
  const visible = useMemo(() => data?.children.get(parentId) ?? [], [data, parentId]);
  // 77 provinces or up to ~50 districts: the grid keeps grouping thousands of readings cheap.
  const visibleIndex = useMemo(() => buildZoneIndex(visible, parentId ? 0.1 : 0.5), [visible, parentId]);

  return useMemo(() => {
    const path = data ? pathIds.map((id) => data.byId.get(id)).filter((z): z is ZoneFeature => !!z) : [];
    const groups = groupByZone(readings, visibleIndex);
    const summaries = new Map(visible.map((z) => [z.properties.id, summarizeZone(groups.get(z.properties.id) ?? [], DEFAULT_CONFIG)]));
    const selected = selectedId ? (data?.byId.get(selectedId) ?? null) : null;
    const focusZone = selected ?? path.at(-1) ?? null;
    const focusReadings = focusZone ? (groupByZone(readings, [focusZone]).get(focusZone.properties.id) ?? []) : readings;
    // Predicted from the id so "›" shows before the child file arrives.
    const hasChildren = (id: string) => levelOf(id) === 1 || (levelOf(id) === 2 && hasSubdistricts(id)) || !!data?.children.get(id)?.length;
    const loading = !failed && (!data || (parentId !== null && !visible.length && tiersFor(parentId).some((t) => !loaded[t])));
    const zonesAt = (p: LatLng) => {
      const district = data?.districtIndex ? zoneAt(data.districtIndex, p) : null;
      const subdistrict = district ? (data!.children.get(district.properties.id)?.find((z) => inZone(z, p)) ?? null) : null;
      return { district, subdistrict };
    };
    const pick = (id: string) => {
      const leaf = !hasChildren(id);
      const chain = chainOf(id);
      setPathIds(leaf ? chain.slice(0, -1) : chain);
      setSelectedId(leaf ? id : null);
      need(tiersFor(id));
    };

    return {
      ready: !!data,
      loading,
      path,
      visible,
      selected,
      summaries,
      focusSummary: summarizeZone(focusReadings, DEFAULT_CONFIG),
      hasChildren,
      zonesAt,
      provinceAt: (p) => (data ? zoneAt(data.provinceIndex, p) : null),
      byId: (id) => data?.byId.get(id) ?? null,
      provinces: data?.children.get(null) ?? [],
      districts: data?.districts ?? null,
      loadDistricts: () => need(['districts']),
      open: (id) => {
        if (hasChildren(id)) {
          setPathIds([...pathIds, id]);
          setSelectedId(null);
          need(tiersFor(id));
        } else setSelectedId(selectedId === id ? null : id);
      },
      pick,
      goTo: (depth) => {
        setPathIds(pathIds.slice(0, depth));
        setSelectedId(null);
      },
      back: () => {
        if (selectedId) setSelectedId(null);
        else setPathIds(pathIds.slice(0, -1));
      },
    };
  }, [data, loaded, failed, pathIds, selectedId, readings, visible, visibleIndex, parentId, need]);
}
