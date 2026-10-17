import type { SourceId } from './types';

/**
 * Every source the apps credit. RID is not an ingest source of its own (its dam figures reach us through ThaiWater),
 * but the apps show RID data, so it gets a credit and a link like the others. TMD radar images also reach us through
 * ThaiWater; they are credited to TMD's radar site, apart from `tmd` (earthquakes).
 */
export type SourceMetaId = SourceId | 'rid' | 'tmd-radar';

export interface SourceMeta {
  id: SourceMetaId;
  /** The public page that hosts this data, not the API endpoint we ingest from. */
  url: string;
  /** Display text for the link, shown next to the agency name: the host without `www.`. */
  domain: string;
  /** Full agency name, as the agency itself writes it. */
  agency: { th: string; en: string };
  gov: boolean;
}

const TMD = { th: 'กรมอุตุนิยมวิทยา', en: 'Thai Meteorological Department (TMD)' };
const BMA = { th: 'กรุงเทพมหานคร', en: 'Bangkok Metropolitan Administration (BMA)' };
const NASA = { th: 'NASA', en: 'NASA' };

// App stores require a visible link to each government source, pointing at the page that hosts the data the app
// shows. HII (ThaiWater) is a public organization under the Ministry of Higher Education, so it counts as government.
export const SOURCE_META: Record<SourceMetaId, SourceMeta> = {
  tmd: { id: 'tmd', url: 'https://earthquake.tmd.go.th', domain: 'earthquake.tmd.go.th', agency: TMD, gov: true },
  'tmd-radar': { id: 'tmd-radar', url: 'https://weather.tmd.go.th', domain: 'weather.tmd.go.th', agency: TMD, gov: true },
  air4thai: {
    id: 'air4thai',
    url: 'https://air4thai.pcd.go.th',
    domain: 'air4thai.pcd.go.th',
    agency: { th: 'กรมควบคุมมลพิษ', en: 'Pollution Control Department (PCD)' },
    gov: true,
  },
  'bma-flood': { id: 'bma-flood', url: 'https://weather.bangkok.go.th/flood', domain: 'weather.bangkok.go.th', agency: BMA, gov: true },
  'bma-rain': { id: 'bma-rain', url: 'https://weather.bangkok.go.th/rain', domain: 'weather.bangkok.go.th', agency: BMA, gov: true },
  // bmatraffic.com refuses connections on port 443, so this one stays http.
  'bma-traffic': { id: 'bma-traffic', url: 'http://www.bmatraffic.com', domain: 'bmatraffic.com', agency: BMA, gov: true },
  thaiwater: {
    id: 'thaiwater',
    url: 'https://www.thaiwater.net',
    domain: 'thaiwater.net',
    agency: { th: 'สถาบันสารสนเทศทรัพยากรน้ำ (สสน.)', en: 'Hydro-Informatics Institute (HII)' },
    gov: true,
  },
  rid: {
    id: 'rid',
    url: 'https://app.rid.go.th/reservoir',
    domain: 'app.rid.go.th',
    agency: { th: 'กรมชลประทาน', en: 'Royal Irrigation Department (RID)' },
    gov: true,
  },
  usgs: {
    id: 'usgs',
    url: 'https://earthquake.usgs.gov',
    domain: 'earthquake.usgs.gov',
    agency: { th: 'สำนักสำรวจธรณีวิทยาสหรัฐฯ (USGS)', en: 'U.S. Geological Survey (USGS)' },
    gov: true,
  },
  gistda: {
    id: 'gistda',
    url: 'https://www.gistda.or.th',
    domain: 'gistda.or.th',
    agency: { th: 'สำนักงานพัฒนาเทคโนโลยีอวกาศและภูมิสารสนเทศ (GISTDA)', en: 'Geo-Informatics and Space Technology Development Agency (GISTDA)' },
    gov: true,
  },
  // NASA is a US federal agency; link the public viewers, not the CSV/JSON endpoints.
  'nasa-firms': { id: 'nasa-firms', url: 'https://firms.modaps.eosdis.nasa.gov', domain: 'firms.modaps.eosdis.nasa.gov', agency: NASA, gov: true },
  'nasa-eonet': { id: 'nasa-eonet', url: 'https://eonet.gsfc.nasa.gov', domain: 'eonet.gsfc.nasa.gov', agency: NASA, gov: true },
  'nasa-gibs': { id: 'nasa-gibs', url: 'https://worldview.earthdata.nasa.gov', domain: 'worldview.earthdata.nasa.gov', agency: NASA, gov: true },
  'open-meteo': { id: 'open-meteo', url: 'https://open-meteo.com', domain: 'open-meteo.com', agency: { th: 'Open-Meteo', en: 'Open-Meteo' }, gov: false },
};
