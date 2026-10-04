export type LayerKey = 'zones' | 'radar' | 'flood' | 'water' | 'pm25' | 'cctv';
export type Layers = Record<LayerKey, boolean>;

/**
 * Geographic bounds of each radar image ([south, west], [north, east]).
 * TODO: calibrate against known landmarks; images include a legend and labels, so they need cropping too.
 */
export const RADAR_BOUNDS: Record<string, [[number, number], [number, number]] | null> = {
  nkm: null,
  njk: null,
  svp120: null,
};
