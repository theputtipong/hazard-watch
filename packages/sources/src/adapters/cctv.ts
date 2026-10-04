import type { CctvCamera } from '@hw/core';
import { getText, settle, type AdapterContext } from '../http';

const BMA_TRAFFIC_URL = 'http://www.bmatraffic.com/';
const viewUrl = (id: string) => `http://www.bmatraffic.com/PlayVideo.aspx?ID=${id}`;

// Rows look like: ['603','BR-05-01 แยกสีลม-นราธิวาส','Silom-Naradhiwas Intersection','แยกสีลม-นราธิวาส','From ...',13.7262,100.52797,'10.x.x.x','pin.png'],
const ROW = /\[\s*'(\d+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'[^']*'\s*,\s*([\d.]+)\s*,\s*([\d.]+)/g;

export function parseBmaTraffic(html: string): CctvCamera[] {
  const start = html.indexOf('var locations');
  if (start < 0) throw new Error('Camera list not found on page');
  const out: CctvCamera[] = [];
  for (const m of html.slice(start).matchAll(ROW)) {
    const [, id, code, en, th, lat, lng] = m as unknown as string[];
    const nameTh = (th || code!.replace(/^\S+\s+/, '')).trim();
    out.push({
      id: `bma-traffic:${id}`,
      source: 'bma-traffic',
      name: { th: nameTh, en: en && en !== '-' ? en.trim() : nameTh },
      location: { lat: Number(lat), lng: Number(lng) },
      viewUrl: viewUrl(id!),
    });
  }
  return out;
}

export const bmaTrafficCameras = (ctx: AdapterContext) =>
  settle('bma-traffic', ctx, async () => parseBmaTraffic(await getText(ctx, BMA_TRAFFIC_URL)));
