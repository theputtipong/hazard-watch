export type LayerKey = 'zones' | 'radar' | 'flood' | 'water' | 'pm25' | 'cctv';
export type Layers = Record<LayerKey, boolean>;

// Radar image positions live in packages/core/src/radars.ts (RADARS).
