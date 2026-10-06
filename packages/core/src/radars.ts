import type { LocalizedText } from './types';

/** [x, y, width, height] in image pixels. */
export type PixelRect = [number, number, number, number];

export type EchoRule =
  /** Lossy images (JPEG/GIF) over a grey map: strongly saturated, not blue. */
  | { kind: 'saturation'; minChroma: number; minNeighbours?: number }
  /** Lossless images over a coloured terrain map: only exact legend colours count. */
  | { kind: 'palette'; colors: [number, number, number][]; minNeighbours?: number };

/**
 * Bounds fitted to the province borders drawn in each image, centre and scale from its crosshair/range rings.
 * Re-fit if a source changes image size or framing; the runner refuses mismatched sizes.
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

const DRRAA_PALETTE: [number, number, number][] = [
  [0, 0, 255],
  [0, 1, 255],
  [0, 3, 255],
  [0, 25, 255],
  [0, 51, 255],
  [0, 87, 33],
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
  [51, 222, 18],
  [51, 255, 0],
  [68, 255, 0],
  [71, 255, 0],
  [102, 255, 0],
  [232, 247, 59],
  [232, 255, 0],
  [247, 245, 0],
  [247, 247, 59],
  [255, 0, 0],
  [255, 0, 255],
  [255, 33, 0],
  [255, 51, 0],
  [255, 51, 255],
  [255, 105, 0],
  [255, 123, 0],
  [255, 125, 0],
  [255, 138, 0],
  [255, 139, 0],
  [255, 143, 0],
  [255, 153, 255],
  [255, 156, 255],
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
/** TMD 680×680 images: legend on the left, logo top-left, caption bar at the bottom. */
const TMD_680_IGNORE: PixelRect[] = [
  [0, 0, 68, 680],
  [68, 0, 72, 75],
  [0, 662, 680, 18],
];
/** Some TMD 680 images draw a red crosshair through the radar (2 px lines at row y, column x). */
const tmdCrosshair = (x: number, y: number): PixelRect[] => [...TMD_680_IGNORE, [68, y, 612, 2], [x, 75, 2, 587]];
/** Songkhla (Sathing Phra) uses an OpenStreetMap base with a label box bottom-right. */
const TMD_STP_IGNORE: PixelRect[] = [...TMD_680_IGNORE, [512, 584, 168, 96]];
/** DRRAA "Rainbow" layout: info and legend panel on the right. */
const drraaPanel = (width: number): PixelRect[] => [[width - 280, 0, 280, 800]];

const SATURATED = { kind: 'saturation', minChroma: 70 } as const;
/** TMD 680 terrain map is olive (chroma ~60), so echoes need more saturation; thin range rings are despeckled. */
const TMD_680_ECHO = { kind: 'saturation', minChroma: 100, minNeighbours: 3 } as const;
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
  cri240: {
    id: 'cri240', agency: 'tmd', name: { th: 'กรมอุตุฯ เชียงราย', en: 'TMD Chiang Rai' },
    bounds: [[17.5259, 97.1623], [22.2429, 102.1459]], size: [680, 680], ignore: TMD_680_IGNORE, echo: TMD_680_ECHO,
  },
  lmp240: {
    id: 'lmp240', agency: 'tmd', name: { th: 'กรมอุตุฯ ลำพูน', en: 'TMD Lamphun' },
    bounds: [[16.2798, 96.5936], [20.7847, 101.3139]], size: [680, 680], ignore: TMD_680_IGNORE, echo: TMD_680_ECHO,
  },
  mhs240: {
    id: 'mhs240', agency: 'tmd', name: { th: 'กรมอุตุฯ แม่ฮ่องสอน', en: 'TMD Mae Hong Son' },
    bounds: [[17.099, 95.5676], [21.4305, 100.2062]], size: [680, 680], ignore: TMD_680_IGNORE, echo: TMD_680_ECHO,
  },
  phs240: {
    id: 'phs240', agency: 'tmd', name: { th: 'กรมอุตุฯ พิษณุโลก', en: 'TMD Phitsanulok' },
    bounds: [[14.3622, 97.524], [19.11, 102.4494]], size: [680, 680], ignore: tmdCrosshair(370, 334), echo: TMD_680_ECHO,
  },
  kkn240: {
    id: 'kkn240', agency: 'tmd', name: { th: 'กรมอุตุฯ ขอนแก่น', en: 'TMD Khon Kaen' },
    bounds: [[14.0522, 100.1283], [18.8, 105.0458]], size: [680, 680], ignore: TMD_680_IGNORE, echo: TMD_680_ECHO,
  },
  skn240: {
    id: 'skn240', agency: 'tmd', name: { th: 'กรมอุตุฯ สกลนคร', en: 'TMD Sakon Nakhon' },
    bounds: [[14.7281, 101.4516], [19.4604, 106.3704]], size: [680, 680], ignore: TMD_680_IGNORE, echo: TMD_680_ECHO,
  },
  skm240: {
    id: 'skm240', agency: 'tmd', name: { th: 'กรมอุตุฯ สมุทรสงคราม', en: 'TMD Samut Songkhram' },
    bounds: [[11.0082, 97.412], [15.756, 102.2602]], size: [680, 680], ignore: TMD_680_IGNORE, echo: TMD_680_ECHO,
  },
  cmp240: {
    id: 'cmp240', agency: 'tmd', name: { th: 'กรมอุตุฯ ชุมพร', en: 'TMD Chumphon' },
    bounds: [[8.2045, 96.7919], [12.7709, 101.4051]], size: [680, 680], ignore: TMD_680_IGNORE, echo: TMD_680_ECHO,
  },
  pkt240: {
    id: 'pkt240', agency: 'tmd', name: { th: 'กรมอุตุฯ ภูเก็ต', en: 'TMD Phuket' },
    bounds: [[5.8031, 95.9018], [10.4155, 100.5299]], size: [680, 680], ignore: tmdCrosshair(357, 334), echo: TMD_680_ECHO,
  },
  stp240: {
    id: 'stp240', agency: 'tmd', name: { th: 'กรมอุตุฯ สงขลา', en: 'TMD Songkhla' },
    bounds: [[5.2622, 98.2739], [9.6287, 102.6482]], size: [680, 680], ignore: TMD_STP_IGNORE, echo: TMD_680_ECHO,
  },
  takhli: {
    id: 'takhli', agency: 'drraa', name: { th: 'ฝนหลวง ตาคลี', en: 'DRRAA Takhli' },
    bounds: [[13.0904, 98.1093], [17.3948, 103.8007]], size: [1020, 800], ignore: [[800, 0, 220, 800]], echo: DRRAA_ECHO,
  },
  sattahip: {
    id: 'sattahip', agency: 'drraa', name: { th: 'ฝนหลวง สัตหีบ', en: 'DRRAA Sattahip' },
    bounds: [[10.4714, 98.7565], [14.8126, 104.7001]], size: [1076, 800], ignore: [[800, 0, 276, 800]], echo: DRRAA_ECHO,
  },
  phimai: {
    id: 'phimai', agency: 'drraa', name: { th: 'ฝนหลวง พิมาย', en: 'DRRAA Phimai' },
    bounds: [[12.9997, 100.3264], [17.325, 105.7111]], size: [967, 800], ignore: [[800, 0, 167, 800]], echo: DRRAA_ECHO,
  },
};

/** Order follows RADARS: Bangkok area first, then by name. */
export const RADAR_IDS = Object.keys(RADARS);
