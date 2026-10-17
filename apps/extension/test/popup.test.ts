import { describe, expect, it } from 'vitest';
import { damCredit, filterPlaces, fold, groupDistricts, pickProvince, restorePick, type PickItem } from '../src/popup';
import { DISTRICTS, PROVINCES } from '../src/status';

const P = (id: string, th: string, en: string): PickItem => ({ id, parent: null, name_th: th, name_en: en });
const D = (id: string, parent: string, th: string, en: string): PickItem => ({ id, parent, name_th: th, name_en: en });

const provinces = [P('TH10', 'กรุงเทพมหานคร', 'Bangkok'), P('TH50', 'เชียงใหม่', 'Chiang Mai'), P('TH12', 'นนทบุรี', 'Nonthaburi')];
const districts = [
  D('TH1007', 'TH10', 'ปทุมวัน', 'Pathum Wan'),
  D('TH1001', 'TH10', 'พระนคร', 'Phra Nakhon'),
  D('TH5001', 'TH50', 'เมืองเชียงใหม่', 'Mueang Chiang Mai'),
  D('TH5004', 'TH50', 'เชียงดาว', 'Chiang Dao'),
  D('TH1201', 'TH12', 'เมืองนนทบุรี', 'Mueang Nonthaburi'),
];

describe('popup picker helpers', () => {
  it('fold ignores case and spaces', () => {
    expect(fold(' Chiang  Mai ')).toBe('chiangmai');
    expect(fold('เชียง ใหม่')).toBe('เชียงใหม่');
  });

  it('groups districts by province, sorted by name in the UI language', () => {
    const en = groupDistricts(districts, 'en');
    expect(en.get('TH50')!.map((d) => d.id)).toEqual(['TH5004', 'TH5001']);
    expect(en.get('TH10')!.map((d) => d.id)).toEqual(['TH1007', 'TH1001']);
    expect(groupDistricts(districts, 'th').get('TH50')!.map((d) => d.id)).toEqual(['TH5004', 'TH5001']);
  });

  it('empty filter keeps everything', () => {
    const r = filterPlaces('  ', provinces, groupDistricts(districts, 'en'), 'en');
    expect(r.provinces.map((p) => p.id)).toEqual(['TH10', 'TH50', 'TH12']);
    expect(r.districts.get('TH10')).toHaveLength(2);
  });

  it('a province-name hit keeps all its districts', () => {
    const r = filterPlaces('chiangmai', provinces, groupDistricts(districts, 'en'), 'en');
    expect(r.provinces.map((p) => p.id)).toEqual(['TH50']);
    expect(r.districts.get('TH50')).toHaveLength(2);
  });

  it('a district-name hit keeps only that district, in Thai or English, ignoring spaces', () => {
    const g = groupDistricts(districts, 'th');
    for (const q of ['ปทุม วัน', 'pathumwan', 'PATHUM WAN']) {
      const r = filterPlaces(q, provinces, g, 'th');
      expect(r.provinces.map((p) => p.id)).toEqual(['TH10']);
      expect(r.districts.get('TH10')!.map((d) => d.id)).toEqual(['TH1007']);
    }
    // "mueang" hits districts in two provinces.
    expect(filterPlaces('mueang', provinces, g, 'en').provinces.map((p) => p.id)).toEqual(['TH50', 'TH12']);
    expect(filterPlaces('zzz', provinces, g, 'en').provinces).toEqual([]);
  });

  it('keeps the chosen province while it is listed, else jumps to the first hit', () => {
    const shown = provinces.slice(1);
    expect(pickProvince('TH12', shown, 'mueang')).toBe('TH12');
    expect(pickProvince('TH10', shown, 'mueang')).toBe('TH50');
    expect(pickProvince('TH10', shown, '')).toBe('');
    expect(pickProvince('', [], 'zzz')).toBe('');
  });

  it('restores a saved district into province + district', () => {
    expect(restorePick('TH5004', districts)).toEqual({ provinceId: 'TH50', districtId: 'TH5004' });
    expect(restorePick('nope', districts)).toBeNull();
    expect(restorePick(null, districts)).toBeNull();
  });

  it('real data: old Greater Bangkok ids still restore, every district has a listed province', () => {
    const items = DISTRICTS.map((d) => d.properties as PickItem);
    expect(PROVINCES).toHaveLength(77);
    // Ids saved by the Greater-Bangkok-only versions (Bangkok, Nonthaburi, Samut Prakan).
    expect(restorePick('TH1001', items)).toEqual({ provinceId: 'TH10', districtId: 'TH1001' });
    expect(restorePick('TH1201', items)?.provinceId).toBe('TH12');
    expect(restorePick('TH1101', items)?.provinceId).toBe('TH11');
    const ids = new Set(PROVINCES.map((p) => p.id));
    expect(items.every((d) => d.parent && ids.has(d.parent))).toBe(true);
    const all = filterPlaces('', PROVINCES, groupDistricts(items, 'th'), 'th');
    expect([...all.districts.values()].reduce((n, l) => n + l.length, 0)).toBe(DISTRICTS.length);
    expect(filterPlaces('เชียงใหม่', PROVINCES, groupDistricts(items, 'th'), 'th').provinces.map((p) => p.id)).toContain('TH50');
  });
});

describe('dam credit', () => {
  it('links ThaiWater in both languages', () => {
    expect(damCredit('th')).toEqual({ label: 'ThaiWater (สสน.)', href: 'https://www.thaiwater.net' });
    expect(damCredit('en')).toEqual({ label: 'ThaiWater (HII)', href: 'https://www.thaiwater.net' });
  });
});
