'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  activeRegions,
  DEFAULT_CONFIG,
  groupByZone,
  inZone,
  summarizeZone,
  type LatLng,
  type Observation,
  type ZoneFeature,
  type ZoneSummary,
} from '@hw/core';

interface ZoneData {
  byId: Map<string, ZoneFeature>;
  children: Map<string | null, ZoneFeature[]>;
}

let cache: Promise<ZoneData> | null = null;

/** Loads the static boundary files once (built by tools/boundaries/build.py into public/geo). */
function loadZones(): Promise<ZoneData> {
  cache ??= Promise.all(
    ['provinces', 'districts', 'subdistricts'].map((name) =>
      fetch(`/geo/${name}.json`).then((r) => r.json() as Promise<{ features: ZoneFeature[] }>),
    ),
  ).then((files) => {
    const pcodes = new Set(activeRegions().flatMap((r) => r.provincePcodes));
    const all = files.flatMap((f) => f.features).filter((z) => pcodes.has(z.properties.id.slice(0, 4)));
    const byId = new Map(all.map((z) => [z.properties.id, z]));
    const children = new Map<string | null, ZoneFeature[]>();
    for (const z of all) {
      const key = z.properties.level === 1 ? null : z.properties.parent;
      children.set(key, [...(children.get(key) ?? []), z]);
    }
    return { byId, children };
  });
  return cache;
}

export interface ZoneView {
  ready: boolean;
  /** Drilled-into zones, top level first (empty = whole coverage area). */
  path: ZoneFeature[];
  /** Zones drawn and listed at the current level. */
  visible: ZoneFeature[];
  /** A leaf zone the user tapped (no deeper level), highlighted on the map. */
  selected: ZoneFeature | null;
  summaries: Map<string, ZoneSummary>;
  /** Summary of what the user is looking at: the selected zone, else the current parent, else everything. */
  focusSummary: ZoneSummary;
  hasChildren: (id: string) => boolean;
  /** District and subdistrict containing a point (computed on the device; the point is not sent anywhere). */
  zonesAt: (p: LatLng) => { district: ZoneFeature | null; subdistrict: ZoneFeature | null };
  open: (id: string) => void;
  goTo: (depth: number) => void;
  back: () => void;
}

/**
 * @param initialArea zone id from a shared link (?area=); the view opens on it once boundaries load.
 * @param fallbackArea read when there is no shared link (e.g. the area the user picked last time).
 */
export function useZones(readings: Observation[], initialArea?: string | null, fallbackArea?: () => string | null): ZoneView {
  const [data, setData] = useState<ZoneData | null>(null);
  const [pathIds, setPathIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    loadZones()
      .then((d) => {
        setData(d);
        const startId = initialArea ?? fallbackArea?.() ?? null;
        const start = startId ? d.byId.get(startId) : null;
        if (!start) return;
        // Ids nest by prefix: TH10 province → TH1028 district → TH102803 subdistrict.
        const chain = [4, 6, 8].map((n) => start.properties.id.slice(0, n)).filter((id, i) => i < start.properties.level && d.byId.has(id));
        const leaf = !d.children.get(start.properties.id)?.length;
        setPathIds(leaf ? chain.slice(0, -1) : chain);
        setSelectedId(leaf ? start.properties.id : null);
      })
      .catch(() => setData(null));
    // Only the first load uses the shared link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useMemo(() => {
    const path = data ? pathIds.map((id) => data.byId.get(id)!).filter(Boolean) : [];
    const parentId = pathIds.at(-1) ?? null;
    const visible = data?.children.get(parentId) ?? [];
    const groups = groupByZone(readings, visible);
    const summaries = new Map(visible.map((z) => [z.properties.id, summarizeZone(groups.get(z.properties.id) ?? [], DEFAULT_CONFIG)]));
    const selected = selectedId ? (data?.byId.get(selectedId) ?? null) : null;
    const focusZone = selected ?? path.at(-1) ?? null;
    const focusReadings = focusZone ? (groupByZone(readings, [focusZone]).get(focusZone.properties.id) ?? []) : readings;
    const hasChildren = (id: string) => !!data?.children.get(id)?.length;
    const zonesAt = (p: LatLng) => {
      const all = data ? [...data.byId.values()] : [];
      const district = all.find((z) => z.properties.level === 2 && inZone(z, p)) ?? null;
      const subdistrict = district ? (data!.children.get(district.properties.id)?.find((z) => inZone(z, p)) ?? null) : null;
      return { district, subdistrict };
    };

    return {
      ready: !!data,
      path,
      visible,
      selected,
      summaries,
      focusSummary: summarizeZone(focusReadings, DEFAULT_CONFIG),
      hasChildren,
      zonesAt,
      open: (id) => {
        if (hasChildren(id)) {
          setPathIds([...pathIds, id]);
          setSelectedId(null);
        } else setSelectedId(selectedId === id ? null : id);
      },
      goTo: (depth) => {
        setPathIds(pathIds.slice(0, depth));
        setSelectedId(null);
      },
      back: () => {
        if (selectedId) setSelectedId(null);
        else setPathIds(pathIds.slice(0, -1));
      },
    };
  }, [data, pathIds, selectedId, readings]);
}
