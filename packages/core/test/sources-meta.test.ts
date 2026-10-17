import { describe, expect, it } from 'vitest';
import { SOURCE_META, type SourceMetaId } from '../src';
import { messages, t, type MessageKey } from '../src/i18n';

const ALL: SourceMetaId[] = [
  'open-meteo', 'tmd', 'tmd-radar', 'air4thai', 'gistda', 'usgs', 'bma-flood', 'bma-rain', 'bma-traffic', 'thaiwater', 'rid',
  'nasa-firms', 'nasa-eonet', 'nasa-gibs',
];

// Government sources the apps render a credit for; each needs a working link to the page that hosts its data.
const RENDERED_GOV: SourceMetaId[] = ['tmd', 'tmd-radar', 'air4thai', 'bma-flood', 'bma-rain', 'thaiwater', 'rid', 'usgs', 'nasa-firms', 'nasa-eonet', 'nasa-gibs'];

// Which agency.* message names each source, so the meta and the UI strings never drift apart.
const AGENCY_KEY: Record<SourceMetaId, MessageKey> = {
  tmd: 'agency.tmd',
  'tmd-radar': 'agency.tmd',
  air4thai: 'agency.air4thai',
  'bma-flood': 'agency.bma',
  'bma-rain': 'agency.bma',
  'bma-traffic': 'agency.bma',
  thaiwater: 'agency.thaiwater',
  rid: 'agency.rid',
  usgs: 'agency.usgs',
  gistda: 'agency.gistda',
  'nasa-firms': 'agency.nasa',
  'nasa-eonet': 'agency.nasa',
  'nasa-gibs': 'agency.nasa',
  'open-meteo': 'agency.openMeteo',
};

describe('SOURCE_META', () => {
  it('has an entry for every source, keyed by its own id', () => {
    expect(Object.keys(SOURCE_META).sort()).toEqual([...ALL].sort());
    for (const id of ALL) expect(SOURCE_META[id].id).toBe(id);
  });

  it('has an entry for every government source the apps render, marked gov', () => {
    for (const id of RENDERED_GOV) expect(SOURCE_META[id], id).toMatchObject({ id, gov: true });
  });

  it('links over https, except bmatraffic.com which has no https', () => {
    for (const { id, url } of Object.values(SOURCE_META)) {
      expect(url).toMatch(id === 'bma-traffic' ? /^http:\/\/www\.bmatraffic\.com$/ : /^https:\/\/[^/]+/);
    }
  });

  it('shows the link host (without www.) as its domain', () => {
    for (const { id, url, domain } of Object.values(SOURCE_META)) {
      expect(domain, id).toBe(url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]);
    }
  });

  it('points each source at the page that hosts its data', () => {
    expect(SOURCE_META.tmd.url).toBe('https://earthquake.tmd.go.th');
    expect(SOURCE_META['tmd-radar']).toMatchObject({ url: 'https://weather.tmd.go.th', domain: 'weather.tmd.go.th' });
    expect(SOURCE_META['bma-flood'].url).toBe('https://weather.bangkok.go.th/flood');
    expect(SOURCE_META['bma-rain'].url).toBe('https://weather.bangkok.go.th/rain');
    expect(SOURCE_META.rid).toMatchObject({ url: 'https://app.rid.go.th/reservoir', domain: 'app.rid.go.th' });
    expect(SOURCE_META.thaiwater.url).toBe('https://www.thaiwater.net');
  });

  it('gives every source a full agency name in both languages, matching its agency.* message', () => {
    for (const { id, agency } of Object.values(SOURCE_META)) {
      expect(agency.th, id).not.toBe('');
      expect(agency.en, id).not.toBe('');
      expect(agency, id).toEqual(messages[AGENCY_KEY[id]]);
    }
  });

  it('marks only Open-Meteo as non-government', () => {
    const nonGov = Object.values(SOURCE_META).filter((m) => !m.gov).map((m) => m.id);
    expect(nonGov).toEqual(['open-meteo']);
  });
});

describe('source credits', () => {
  it('fills the credit template with agency and domain', () => {
    const { agency, domain } = SOURCE_META.rid;
    expect(t('source.dataFrom', 'th', { agency: agency.th, domain })).toBe('ข้อมูลจาก กรมชลประทาน · app.rid.go.th');
    expect(t('source.dataFrom', 'en', { agency: agency.en, domain })).toBe('Data from Royal Irrigation Department (RID) · app.rid.go.th');
  });

  it('has a description for RID and the independence disclaimer in both languages', () => {
    for (const key of ['sources.desc.rid', 'disclaimer.notGov'] as const) {
      expect(messages[key].th).not.toBe('');
      expect(messages[key].en).not.toBe('');
    }
    expect(messages['disclaimer.notGov'].th).toContain('ไม่ใช่แอปของรัฐ');
    expect(messages['disclaimer.notGov'].en).toContain('not a government app');
  });

  it('never words anything as if the app were official', () => {
    for (const [key, v] of Object.entries(messages)) {
      expect(v.th, key).not.toMatch(/ทางการ/);
      expect(v.en, key).not.toMatch(/\bofficial\b/i);
    }
  });

  it('uses the same placeholders in both languages', () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, v] of Object.entries(messages)) expect(names(v.en), key).toEqual(names(v.th));
  });
});
