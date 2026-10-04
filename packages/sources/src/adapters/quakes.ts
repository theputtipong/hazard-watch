import type { Earthquake } from '@hw/core';
import { XMLParser } from 'fast-xml-parser';
import { getJson, getText, settle, type AdapterContext } from '../http';

const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson';
const TMD_RSS_URL = 'https://earthquake.tmd.go.th/feed/rss_tmd.xml';

interface UsgsFeed {
  features: {
    id: string;
    properties: { mag: number; place: string; time: number; url: string };
    geometry: { coordinates: [number, number, number] };
  }[];
}

export function parseUsgs(feed: UsgsFeed): Earthquake[] {
  return feed.features.map((f) => ({
    id: `usgs:${f.id}`,
    source: 'usgs',
    magnitude: f.properties.mag,
    depthKm: f.geometry.coordinates[2] ?? null,
    location: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
    place: { th: f.properties.place, en: f.properties.place },
    occurredAt: new Date(f.properties.time).toISOString(),
    url: f.properties.url,
  }));
}

interface TmdItem {
  title: string;
  link: string;
  'geo:lat': number;
  'geo:long': number;
  'tmd:depth': number;
  'tmd:magnitude': number;
  'tmd:time': string;
  comments?: string;
}

export function parseTmdQuakeRss(xml: string): Earthquake[] {
  const doc = new XMLParser({ ignoreAttributes: true, parseTagValue: true }).parse(xml);
  const raw = doc?.rss?.channel?.item ?? [];
  const items: TmdItem[] = Array.isArray(raw) ? raw : [raw];
  return items.map((it) => {
    const title = String(it.title);
    const english = title.match(/\(([^)]+)\)/)?.[1] ?? title;
    return {
      id: `tmd:${new URL(it.link).searchParams.get('earthquake') ?? it['tmd:time']}`,
      source: 'tmd',
      magnitude: Number(it['tmd:magnitude']),
      depthKm: Number.isFinite(Number(it['tmd:depth'])) ? Number(it['tmd:depth']) : null,
      location: { lat: Number(it['geo:lat']), lng: Number(it['geo:long']) },
      place: { th: it.comments ? String(it.comments).trim() : title, en: english },
      occurredAt: new Date(String(it['tmd:time']).replace(' UTC', 'Z').replace(' ', 'T')).toISOString(),
      url: it.link,
    };
  });
}

export const usgsQuakes = (ctx: AdapterContext) =>
  settle('usgs', ctx, async () => parseUsgs(await getJson(ctx, USGS_URL)));

export const tmdQuakes = (ctx: AdapterContext) =>
  settle('tmd', ctx, async () => parseTmdQuakeRss(await getText(ctx, TMD_RSS_URL)));
