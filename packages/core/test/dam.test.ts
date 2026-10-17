import { describe, expect, it } from 'vitest';
import {
  DAM_STATUSES,
  DEFAULT_CONFIG,
  FEED_TOPICS,
  FEED_TOPIC_MAX_AGE_MINUTES,
  damSeverity,
  damStatus,
  feedStatuses,
  type DamExtra,
  type DashboardSnapshot,
  type Observation,
} from '../src';
import { messages } from '../src/i18n';

const cfg = DEFAULT_CONFIG;
const text = messages as Record<string, { th: string; en: string }>;

describe('damStatus', () => {
  it.each([
    [101, 'over'],
    [100.01, 'over'],
    [100, 'high'],
    [81, 'high'],
    [80.01, 'high'],
    [80, 'normal'],
    [51, 'normal'],
    [50, 'low'],
    [31, 'low'],
    [30, 'critical'],
    [0, 'critical'],
  ] as const)('storage %s%% with no usable %% → %s', (pct, status) => {
    expect(damStatus(pct, null, cfg)).toBe(status);
    expect(damStatus(pct, undefined, cfg)).toBe(status);
  });

  it('uses usable water ≤ 30 % for critical, as ThaiWater rule_web does', () => {
    expect(damStatus(45, 30, cfg)).toBe('critical');
    expect(damStatus(45, 31, cfg)).toBe('low');
    expect(damStatus(60, 25, cfg)).toBe('critical');
    expect(damStatus(30, 31, cfg)).toBe('low');
    expect(damStatus(29, 30.5, cfg)).toBe('low');
  });

  it('lets high storage win over a low usable %', () => {
    expect(damStatus(85, 20, cfg)).toBe('high');
    expect(damStatus(105, 10, cfg)).toBe('over');
  });

  it('reads the bands from config', () => {
    const c = { ...cfg, dam: { ...cfg.dam, highPct: 70 } };
    expect(damStatus(75, null, c)).toBe('high');
  });
});

describe('damSeverity', () => {
  it('maps over → danger, high → watch, the rest → ok (display only)', () => {
    expect(damSeverity(101, null, cfg)).toBe('danger');
    expect(damSeverity(100, null, cfg)).toBe('watch');
    expect(damSeverity(81, null, cfg)).toBe('watch');
    expect(damSeverity(80, null, cfg)).toBe('ok');
    expect(damSeverity(40, 20, cfg)).toBe('ok');
    expect(damSeverity(10, null, cfg)).toBe('ok');
  });

  it('is never pushed, zoned or alerted', () => {
    expect(cfg.zones.kinds).not.toContain('dam');
    expect(cfg.push.kinds as string[]).not.toContain('dam');
    expect(cfg.units.dam).toBe('%');
  });
});

describe('dam types', () => {
  it('fits DamExtra into Observation.extra', () => {
    const extra: DamExtra = {
      storageMcm: 1191.22,
      capacityMcm: 1980,
      usablePct: 55.11,
      inflowMcm: 1.01,
      releaseMcm: 4.43,
      size: 'large',
      basin: 'ชี',
      province: 'กาฬสินธุ์',
      agency: 'กรมชลประทาน',
    };
    const o: Observation = {
      id: 'thaiwater:dam:2901810',
      kind: 'dam',
      source: 'thaiwater',
      name: { th: 'เขื่อนลำปาว', en: 'Lam Pao Dam' },
      location: { lat: 16.6, lng: 103.4 },
      observedAt: '2026-10-17T00:00:00+07:00',
      value: 60.16,
      unit: cfg.units.dam,
      severity: damSeverity(60.16, extra.usablePct, cfg),
      extra,
    };
    expect(o.severity).toBe('ok');
  });
});

describe('dams feed', () => {
  const NOW = new Date('2026-10-17T12:00:00Z');
  const at = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
  const snap = (lastOkAt: string): DashboardSnapshot => ({
    edge: null,
    runner: { updatedAt: NOW.toISOString(), feeds: { dams: { source: 'thaiwater', fetchedAt: lastOkAt, ok: true, items: [] } } },
  });

  it('is a runner topic judged by a ~36 h limit', () => {
    expect(FEED_TOPICS).toContain('dams');
    expect(FEED_TOPIC_MAX_AGE_MINUTES.dams).toBe(36 * 60);
    expect(feedStatuses(snap(at(20)), NOW)).toEqual([expect.objectContaining({ topic: 'dams', state: 'live' })]);
    expect(feedStatuses(snap(at(37)), NOW)).toEqual([expect.objectContaining({ topic: 'dams', state: 'stale' })]);
  });
});

describe('dam i18n', () => {
  const keys = [
    'card.dam',
    'layer.dam',
    'feeds.name.dams',
    'dam.storage',
    'dam.storagePct',
    'dam.usable',
    'dam.inflow',
    'dam.release',
    'dam.capacity',
    'dam.unitMcm',
    'dam.unitMcmPerDay',
    'dam.size.large',
    'dam.size.medium',
    'dam.note',
    'dam.credit',
    ...DAM_STATUSES.map((s) => `dam.status.${s}`),
  ];

  it('has every key in Thai and English with the same placeholders', () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of keys) {
      const m = text[key]!;
      expect(m, key).toBeTruthy();
      expect(m.th, key).not.toBe('');
      expect(m.en, key).not.toBe('');
      expect(ph(m.th), key).toEqual(ph(m.en));
    }
  });

  it('uses the agreed Thai wording', () => {
    expect(messages['card.dam'].th).toBe('เขื่อนและอ่างเก็บน้ำ');
    expect(messages['dam.status.critical'].th).toBe('น้ำน้อยวิกฤต');
    expect(messages['dam.unitMcmPerDay'].th).toBe('ล้าน ลบ.ม./วัน');
    expect(messages['dam.note'].th).toBe('ข้อมูลประกอบ ไม่ใช่การแจ้งเตือน');
    expect(messages['dam.credit'].th).toMatch(/ThaiWater.*สสน\..*กรมชลประทาน/);
    expect(messages['dam.credit'].en).toMatch(/RID/);
    expect(messages['sources.desc.thaiwater'].th).toContain('เขื่อน');
    expect(messages['sources.desc.thaiwater'].en).toMatch(/dam/i);
  });
});
