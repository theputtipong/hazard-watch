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

/**
 * All 77 provinces as [OCHA pcode, Thai name]. Names are spelled as OCHA/ThaiWater do (the test checks them
 * against apps/web/public/geo/names.json), because ThaiWater rows are filtered by exact `province_name.th`.
 */
const TH_PROVINCES: readonly (readonly [string, string])[] = [
  ['TH10', 'กรุงเทพมหานคร'], ['TH11', 'สมุทรปราการ'], ['TH12', 'นนทบุรี'], ['TH13', 'ปทุมธานี'],
  ['TH14', 'พระนครศรีอยุธยา'], ['TH15', 'อ่างทอง'], ['TH16', 'ลพบุรี'], ['TH17', 'สิงห์บุรี'],
  ['TH18', 'ชัยนาท'], ['TH19', 'สระบุรี'], ['TH20', 'ชลบุรี'], ['TH21', 'ระยอง'],
  ['TH22', 'จันทบุรี'], ['TH23', 'ตราด'], ['TH24', 'ฉะเชิงเทรา'], ['TH25', 'ปราจีนบุรี'],
  ['TH26', 'นครนายก'], ['TH27', 'สระแก้ว'], ['TH30', 'นครราชสีมา'], ['TH31', 'บุรีรัมย์'],
  ['TH32', 'สุรินทร์'], ['TH33', 'ศรีสะเกษ'], ['TH34', 'อุบลราชธานี'], ['TH35', 'ยโสธร'],
  ['TH36', 'ชัยภูมิ'], ['TH37', 'อำนาจเจริญ'], ['TH38', 'บึงกาฬ'], ['TH39', 'หนองบัวลำภู'],
  ['TH40', 'ขอนแก่น'], ['TH41', 'อุดรธานี'], ['TH42', 'เลย'], ['TH43', 'หนองคาย'],
  ['TH44', 'มหาสารคาม'], ['TH45', 'ร้อยเอ็ด'], ['TH46', 'กาฬสินธุ์'], ['TH47', 'สกลนคร'],
  ['TH48', 'นครพนม'], ['TH49', 'มุกดาหาร'], ['TH50', 'เชียงใหม่'], ['TH51', 'ลำพูน'],
  ['TH52', 'ลำปาง'], ['TH53', 'อุตรดิตถ์'], ['TH54', 'แพร่'], ['TH55', 'น่าน'],
  ['TH56', 'พะเยา'], ['TH57', 'เชียงราย'], ['TH58', 'แม่ฮ่องสอน'], ['TH60', 'นครสวรรค์'],
  ['TH61', 'อุทัยธานี'], ['TH62', 'กำแพงเพชร'], ['TH63', 'ตาก'], ['TH64', 'สุโขทัย'],
  ['TH65', 'พิษณุโลก'], ['TH66', 'พิจิตร'], ['TH67', 'เพชรบูรณ์'], ['TH70', 'ราชบุรี'],
  ['TH71', 'กาญจนบุรี'], ['TH72', 'สุพรรณบุรี'], ['TH73', 'นครปฐม'], ['TH74', 'สมุทรสาคร'],
  ['TH75', 'สมุทรสงคราม'], ['TH76', 'เพชรบุรี'], ['TH77', 'ประจวบคีรีขันธ์'], ['TH80', 'นครศรีธรรมราช'],
  ['TH81', 'กระบี่'], ['TH82', 'พังงา'], ['TH83', 'ภูเก็ต'], ['TH84', 'สุราษฎร์ธานี'],
  ['TH85', 'ระนอง'], ['TH86', 'ชุมพร'], ['TH90', 'สงขลา'], ['TH91', 'สตูล'],
  ['TH92', 'ตรัง'], ['TH93', 'พัทลุง'], ['TH94', 'ปัตตานี'], ['TH95', 'ยะลา'],
  ['TH96', 'นราธิวาส'],
];

export const REGIONS = {
  // Kept for tests and as the original coverage; no longer active.
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
  'th-all': {
    id: 'th-all',
    country: 'TH',
    name: { th: 'ทั่วประเทศไทย', en: 'All of Thailand' },
    bbox: { minLat: 5.6, maxLat: 20.5, minLng: 97.3, maxLng: 105.7 },
    center: { lat: 13.0, lng: 101.0 },
    zoom: 6,
    provincePcodes: TH_PROVINCES.map(([pcode]) => pcode),
    provincesTh: TH_PROVINCES.map(([, th]) => th),
  },
} as const satisfies Record<string, Region>;

export type RegionId = keyof typeof REGIONS;

export const ACTIVE_REGION_IDS: RegionId[] = ['th-all'];

/** Default view when nothing is picked/located: Bangkok district zoom, not the whole region. */
export const DEFAULT_VIEW: { center: LatLng; zoom: number } = { center: { lat: 13.7563, lng: 100.5018 }, zoom: 11 };

export const activeRegions = (ids: readonly RegionId[] = ACTIVE_REGION_IDS): Region[] => ids.map((id) => REGIONS[id]);

export function inBBox({ lat, lng }: LatLng, b: BBox): boolean {
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

export const inRegions = (p: LatLng, regions: readonly Region[]) => regions.some((r) => inBBox(p, r.bbox));

export const regionProvinces = (regions: readonly Region[]) => new Set(regions.flatMap((r) => r.provincesTh));

export function regionFor(p: LatLng | null, regions: readonly Region[] = activeRegions()): Region {
  return (p && regions.find((r) => inBBox(p, r.bbox))) || regions[0]!;
}
