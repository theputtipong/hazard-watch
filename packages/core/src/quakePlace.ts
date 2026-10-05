import { t, type Lang } from './i18n';
import type { Earthquake } from './types';

/** Thai names for countries USGS commonly names around Thailand (lower-case English key → Thai). */
export const COUNTRY_TH: Record<string, string> = {
  thailand: 'ไทย',
  myanmar: 'เมียนมา',
  burma: 'เมียนมา',
  laos: 'ลาว',
  cambodia: 'กัมพูชา',
  vietnam: 'เวียดนาม',
  malaysia: 'มาเลเซีย',
  singapore: 'สิงคโปร์',
  indonesia: 'อินโดนีเซีย',
  philippines: 'ฟิลิปปินส์',
  china: 'จีน',
  taiwan: 'ไต้หวัน',
  japan: 'ญี่ปุ่น',
  india: 'อินเดีย',
  bangladesh: 'บังกลาเทศ',
  bhutan: 'ภูฏาน',
  nepal: 'เนปาล',
  pakistan: 'ปากีสถาน',
  'sri lanka': 'ศรีลังกา',
  brunei: 'บรูไน',
  'timor leste': 'ติมอร์-เลสเต',
  'east timor': 'ติมอร์-เลสเต',
  'papua new guinea': 'ปาปัวนิวกินี',
};

/** Seas and island groups USGS names without a country. */
const SEA_TH: Record<string, string> = {
  'andaman sea': 'ทะเลอันดามัน',
  'south china sea': 'ทะเลจีนใต้',
  'bay of bengal': 'อ่าวเบงกอล',
  'gulf of thailand': 'อ่าวไทย',
  'banda sea': 'ทะเลบันดา',
  'molucca sea': 'ทะเลโมลุกกะ',
  'celebes sea': 'ทะเลเซเลบีส',
  'java sea': 'ทะเลชวา',
  'philippine islands region': 'ฟิลิปปินส์',
};

/** Islands that tell the country when USGS omits it ("off the west coast of northern Sumatra"). */
const ISLAND_COUNTRY: [RegExp, string][] = [
  [/\b(sumatra|java|bali|borneo|kalimantan|sulawesi|celebes|molucca|halmahera|sumba|flores|timor|papua)\b/, 'indonesia'],
  [/\b(mindanao|luzon|visayas|samar|leyte|mindoro|panay|negros)\b/, 'philippines'],
  [/\b(andaman|nicobar)\b/, 'india'],
];

const countryName = (key: string) => COUNTRY_TH[key] ?? null;

/**
 * Thai name of the area in a USGS place string, or null when it can't be told.
 * Examples: "45 km NNE of Mawlaik, Myanmar" → "ประเทศเมียนมา"; "Myanmar-China border region" → "ชายแดนเมียนมา–จีน".
 */
export function thaiQuakeArea(usgsPlace: string): string | null {
  const text = usgsPlace.trim().toLowerCase();
  if (!text) return null;
  const last = (text.split(',').at(-1) ?? text).trim().replace(/\s+region$/, '').trim();
  // USGS writes some names with an alias in brackets: "Burma (Myanmar)".
  const alias = last.match(/\(([^)]+)\)/)?.[1]?.trim();
  const tail = alias && countryName(alias) ? alias : last.replace(/\s*\([^)]*\)/g, '').trim();

  const border = tail.match(/^(.+?)\s*-\s*(.+?)\s+border$/);
  if (border) {
    const a = countryName(border[1]!);
    const b = countryName(border[2]!);
    if (a && b) return t('quake.border', 'th', { a, b });
  }
  const country = countryName(tail);
  if (country) return t('quake.country', 'th', { name: country });
  const sea = SEA_TH[tail] ?? SEA_TH[`${tail} region`];
  if (sea) return sea;
  for (const [pattern, key] of ISLAND_COUNTRY) {
    if (pattern.test(text)) return t('quake.country', 'th', { name: COUNTRY_TH[key]! });
  }
  return null;
}

/**
 * Place text for a quake in the chosen language. TMD names come in Thai and are shown as-is; USGS names are
 * English only, so in Thai they become the country (when known) plus the distance from the user, if given.
 */
export function quakePlace(quake: Pick<Earthquake, 'source' | 'place'>, lang: Lang, km?: number): string {
  if (lang !== 'th' || quake.source !== 'usgs') return quake.place[lang] || quake.place.en;
  const area = thaiQuakeArea(quake.place.en || quake.place.th);
  if (km === undefined) return area ?? quake.place.en;
  const away = t('quake.away', 'th', { km: Math.round(km).toLocaleString('en-US') });
  return area ? `${area} ${away}` : away;
}

/** True when `quakePlace(q, lang, km)` already says how far away the quake is. */
export const quakePlaceHasDistance = (quake: Pick<Earthquake, 'source'>, lang: Lang) => lang === 'th' && quake.source === 'usgs';
