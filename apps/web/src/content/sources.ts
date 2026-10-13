import { SOURCE_META, type SourceId } from '@hw/core';
import type { Lang, MessageKey } from '@hw/core/i18n';

export interface SourceLink {
  name: Record<Lang, string>;
  url: string;
  desc: MessageKey;
}

// One entry per agency: the three BMA feeds share a public site, so it is listed once.
const entries: { id: SourceId; name: Record<Lang, string>; desc: MessageKey }[] = [
  { id: 'tmd', name: { th: 'กรมอุตุนิยมวิทยา', en: 'TMD' }, desc: 'sources.desc.tmd' },
  { id: 'bma-flood', name: { th: 'สำนักการระบายน้ำ กทม.', en: 'BMA Drainage Dept.' }, desc: 'sources.desc.bma' },
  { id: 'thaiwater', name: { th: 'สสน. (ThaiWater)', en: 'HII ThaiWater' }, desc: 'sources.desc.thaiwater' },
  { id: 'air4thai', name: { th: 'กรมควบคุมมลพิษ', en: 'PCD' }, desc: 'sources.desc.air4thai' },
  { id: 'gistda', name: { th: 'GISTDA', en: 'GISTDA' }, desc: 'sources.desc.gistda' },
  { id: 'usgs', name: { th: 'USGS', en: 'USGS' }, desc: 'sources.desc.usgs' },
  { id: 'open-meteo', name: { th: 'Open-Meteo', en: 'Open-Meteo' }, desc: 'sources.desc.openMeteo' },
];

export const sourceLinks: SourceLink[] = entries.map(({ id, name, desc }) => ({ name, url: SOURCE_META[id].url, desc }));

export const dataLabel: Record<Lang, string> = { th: 'ข้อมูลจาก', en: 'Data:' };

export const mapCredits: Record<Lang, string> = {
  th: 'ขอบเขตพื้นที่: กรุงเทพมหานคร, geoBoundaries, OCHA/กรมแผนที่ทหาร · แผนที่ OpenFreeMap © OpenMapTiles ข้อมูลจากผู้ร่วมพัฒนา OpenStreetMap',
  en: 'Boundaries: BMA, geoBoundaries, OCHA/RTSD · Map: OpenFreeMap © OpenMapTiles, data from OpenStreetMap contributors',
};
