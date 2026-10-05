import type { LocalizedText } from './types';

/** [x, y, width, height] in image pixels. */
export type PixelRect = [number, number, number, number];

/** How rain echoes are told apart from the base map drawn under them. */
export type EchoRule =
  /** Lossy images (JPEG/GIF) over a grey map: strongly saturated, not blue. */
  | { kind: 'saturation'; minChroma: number; minNeighbours?: number }
  /** Lossless images over a coloured terrain map: only exact legend colours count. */
  | { kind: 'palette'; colors: [number, number, number][]; minNeighbours?: number };

/**
 * One radar image from the ThaiWater feed and where it sits on the map.
 * Bounds were fitted by matching the province borders drawn in each image against real boundaries, with the
 * radar centre and scale taken from the image's own crosshair/range rings (see TODO.md "เรดาร์").
 * Re-fit if a source changes its image size or framing — the runner refuses mismatched sizes.
 */
export interface RadarSpec {
  id: string;
  agency: 'bma' | 'tmd' | 'drraa';
  name: LocalizedText;
  /** [[south, west], [north, east]] of the whole image. */
  bounds: [[number, number], [number, number]];
  size: [number, number];
  /** Legend, logos and label boxes — always transparent. */
  ignore: PixelRect[];
  echo: EchoRule;
}

/** Legend colours used by DRRAA (ฝนหลวง) radar images. */
const DRRAA_PALETTE: [number, number, number][] = [
  [0, 0, 255],
  [0, 25, 255],
  [0, 51, 255],
  [0, 102, 79],
  [0, 102, 255],
  [0, 125, 79],
  [0, 153, 255],
  [0, 172, 0],
  [0, 176, 71],
  [0, 200, 0],
  [0, 204, 51],
  [0, 204, 255],
  [0, 224, 20],
  [0, 235, 0],
  [51, 255, 0],
  [71, 255, 0],
  [232, 247, 59],
  [247, 245, 0],
  [255, 0, 0],
  [255, 0, 255],
  [255, 33, 0],
  [255, 51, 0],
  [255, 51, 255],
  [255, 105, 0],
  [255, 123, 0],
  [255, 125, 0],
  [255, 138, 0],
  [255, 153, 255],
  [255, 176, 0],
  [255, 176, 23],
  [255, 179, 255],
  [255, 198, 0],
  [255, 199, 0],
  [255, 214, 0],
  [255, 240, 0],
  [255, 245, 0],
  [255, 247, 59],
  [255, 255, 0],
];

const BMA_IGNORE: PixelRect[] = [
  [0, 0, 76, 800],
  [760, 670, 205, 130],
];
const TMD_796_IGNORE: PixelRect[] = [
  [0, 0, 60, 677],
  [60, 0, 80, 75],
  [700, 0, 96, 70],
  [630, 560, 166, 117],
];
const DRRAA_862_IGNORE: PixelRect[] = [
  [0, 0, 80, 800],
  [0, 780, 862, 20],
];
/** DRRAA "Rainbow" layout: info and legend panel on the right. */
const drraaPanel = (width: number): PixelRect[] => [[width - 280, 0, 280, 800]];

const SATURATED = { kind: 'saturation', minChroma: 70 } as const;
const DRRAA_ECHO = { kind: 'palette', colors: DRRAA_PALETTE } as const;

export const RADARS: Record<string, RadarSpec> = {
  nkm: {
    id: 'nkm', agency: 'bma', name: { th: 'กทม. หนองแขม', en: 'BMA Nong Khaem' },
    bounds: [[12.654, 99.0148], [14.8246, 101.692]], size: [965, 800], ignore: BMA_IGNORE, echo: SATURATED,
  },
  njk: {
    id: 'njk', agency: 'bma', name: { th: 'กทม. หนองจอก', en: 'BMA Nong Chok' },
    bounds: [[12.7467, 99.5102], [14.9173, 102.1885]], size: [965, 800], ignore: BMA_IGNORE, echo: SATURATED,
  },
  svp120: {
    id: 'svp120', agency: 'tmd', name: { th: 'กรมอุตุฯ สุวรรณภูมิ', en: 'TMD Suvarnabhumi' },
    bounds: [[12.5967, 99.4668], [14.7641, 102.0721]], size: [796, 677], ignore: TMD_796_IGNORE, echo: SATURATED,
  },
  ubn120: {
    id: 'ubn120', agency: 'tmd', name: { th: 'กรมอุตุฯ อุบลราชธานี (120 กม.)', en: 'TMD Ubon Ratchathani (120 km)' },
    bounds: [[14.1633, 103.5632], [16.3216, 106.1757]], size: [796, 677], ignore: TMD_796_IGNORE, echo: SATURATED,
  },
  ubn240: {
    id: 'ubn240', agency: 'tmd', name: { th: 'กรมอุตุฯ อุบลราชธานี (240 กม.)', en: 'TMD Ubon Ratchathani (240 km)' },
    bounds: [[13.0749, 102.2491], [17.4067, 107.4926]], size: [796, 677], ignore: TMD_796_IGNORE, echo: SATURATED,
  },
  srn240: {
    id: 'srn240', agency: 'tmd', name: { th: 'กรมอุตุฯ สุรินทร์', en: 'TMD Surin' },
    bounds: [[12.6972, 100.8763], [17.0444, 106.1293]], size: [796, 677], ignore: TMD_796_IGNORE, echo: SATURATED,
  },
  omkoi: {
    id: 'omkoi', agency: 'drraa', name: { th: 'ฝนหลวง อมก๋อย', en: 'DRRAA Omkoi' },
    bounds: [[15.6267, 96.183], [19.9533, 102.2308]], size: [1072, 800], ignore: drraaPanel(1072), echo: DRRAA_ECHO,
  },
  rongkwang: {
    id: 'rongkwang', agency: 'drraa', name: { th: 'ฝนหลวง ร้องกวาง', en: 'DRRAA Rong Kwang' },
    bounds: [[16.1493, 98.0345], [20.4759, 103.9874]], size: [1052, 800], ignore: drraaPanel(1052), echo: DRRAA_ECHO,
  },
  banphue: {
    id: 'banphue', agency: 'drraa', name: { th: 'ฝนหลวง บ้านผือ', en: 'DRRAA Ban Phue' },
    bounds: [[15.3128, 99.9822], [19.7299, 104.9406]], size: [862, 800], ignore: DRRAA_862_IGNORE, echo: DRRAA_ECHO,
  },
  rasisalai: {
    id: 'rasisalai', agency: 'drraa', name: { th: 'ฝนหลวง ราษีไศล', en: 'DRRAA Rasi Salai' },
    bounds: [[13.061, 101.4431], [17.4817, 106.3484]], size: [862, 800], ignore: DRRAA_862_IGNORE, echo: DRRAA_ECHO,
  },
  pathio: {
    id: 'pathio', agency: 'drraa', name: { th: 'ฝนหลวง ปะทิว', en: 'DRRAA Pathio' },
    bounds: [[8.4773, 96.7357], [12.9052, 101.559]], size: [862, 800], ignore: DRRAA_862_IGNORE, echo: DRRAA_ECHO,
  },
};

/** Radar ids in a stable order for pickers: Bangkok area first, then by name. */
export const RADAR_IDS = Object.keys(RADARS);
