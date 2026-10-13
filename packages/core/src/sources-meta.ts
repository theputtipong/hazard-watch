import type { SourceId } from './types';

export interface SourceMeta {
  id: SourceId;
  url: string;
  gov: boolean;
}

// Public pages people can open, not the API endpoints we ingest from: app stores require a visible link to each
// government source. HII (ThaiWater) is a public organization under the Ministry of Higher Education, so it counts.
export const SOURCE_META: Record<SourceId, SourceMeta> = {
  tmd: { id: 'tmd', url: 'https://www.tmd.go.th', gov: true },
  air4thai: { id: 'air4thai', url: 'https://air4thai.pcd.go.th', gov: true },
  'bma-flood': { id: 'bma-flood', url: 'https://weather.bangkok.go.th', gov: true },
  'bma-rain': { id: 'bma-rain', url: 'https://weather.bangkok.go.th', gov: true },
  // bmatraffic.com refuses connections on port 443, so this one stays http.
  'bma-traffic': { id: 'bma-traffic', url: 'http://www.bmatraffic.com', gov: true },
  thaiwater: { id: 'thaiwater', url: 'https://www.thaiwater.net', gov: true },
  usgs: { id: 'usgs', url: 'https://earthquake.usgs.gov', gov: true },
  gistda: { id: 'gistda', url: 'https://www.gistda.or.th', gov: true },
  'open-meteo': { id: 'open-meteo', url: 'https://open-meteo.com', gov: false },
};
