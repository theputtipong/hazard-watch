import type { LocalizedText } from './types';

/** [x, y, width, height] in image pixels. */
export type PixelRect = [number, number, number, number];

/**
 * Radar images (ThaiWater feed) and where they sit on the map.
 * Bounds were fitted automatically by matching the province borders drawn in each image against real
 * province boundaries (see TODO.md "เรดาร์"); re-fit if a source changes its image size or framing.
 */
export interface RadarSpec {
  id: string;
  name: LocalizedText;
  /** [[south, west], [north, east]] of the whole image. */
  bounds: [[number, number], [number, number]];
  /** Image size the bounds were fitted for; other sizes are rejected rather than drawn in the wrong place. */
  size: [number, number];
  /** Parts of the image that are not rain (legend, logos, label boxes) and are always made transparent. */
  ignore: PixelRect[];
}

export const RADARS: Record<string, RadarSpec> = {
  nkm: {
    id: 'nkm',
    name: { th: 'กทม. หนองแขม', en: 'BMA Nong Khaem' },
    bounds: [
      [12.654, 99.0148],
      [14.8246, 101.692],
    ],
    size: [965, 800],
    ignore: [
      [0, 0, 76, 800],
      [760, 670, 205, 130],
    ],
  },
  njk: {
    id: 'njk',
    name: { th: 'กทม. หนองจอก', en: 'BMA Nong Chok' },
    bounds: [
      [12.7467, 99.5102],
      [14.9173, 102.1885],
    ],
    size: [965, 800],
    ignore: [
      [0, 0, 76, 800],
      [760, 670, 205, 130],
    ],
  },
  svp120: {
    id: 'svp120',
    name: { th: 'กรมอุตุฯ สุวรรณภูมิ', en: 'TMD Suvarnabhumi' },
    bounds: [
      [12.5967, 99.4668],
      [14.7641, 102.0721],
    ],
    size: [796, 677],
    ignore: [
      [0, 0, 60, 677],
      [60, 0, 80, 75],
      [700, 0, 96, 70],
      [630, 560, 166, 117],
    ],
  },
};
