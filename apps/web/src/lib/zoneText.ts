import { DEFAULT_CONFIG, isBangkokZone, type ZoneFeature, type ZoneSummary } from '@hw/core';
import { t, type Lang, type MessageKey } from '@hw/core/i18n';

const u = DEFAULT_CONFIG.units;

export function levelName(level: number, bangkok: boolean, lang: Lang, kind: 'level' | 'prefix' = 'level'): string {
  if (level <= 1) return kind === 'level' ? t('zone.level1', lang) : '';
  const key = `zone.${kind}${level}${bangkok ? '.bkk' : ''}` as MessageKey;
  return t(key, lang);
}

export function zoneLabel(z: ZoneFeature, lang: Lang): string {
  const name = z.properties[lang === 'th' ? 'name_th' : 'name_en'];
  const prefix = levelName(z.properties.level, isBangkokZone(z.properties.id), lang, 'prefix');
  return prefix ? `${prefix}${name}` : name;
}

export function describe(s: ZoneSummary, lang: Lang): string {
  if (s.severity === null) return t('zone.sum.none', lang);
  const parts: string[] = [];
  if (s.flooded) parts.push(t('zone.sum.flooded', lang, { n: s.flooded }));
  if (s.minorFlood) parts.push(t('zone.sum.minor', lang, { n: s.minorFlood }));
  if (s.rainMax) parts.push(t('zone.sum.rain', lang, { v: s.rainMax, u: u.rain }));
  if (s.waterLevelMax !== null) parts.push(t('zone.sum.water', lang, { v: Math.round(s.waterLevelMax), u: u.waterLevel }));
  if (s.pm25Max !== null) parts.push(t('zone.sum.pm25', lang, { v: s.pm25Max, u: u.pm25 }));
  if (!s.flooded && !s.minorFlood && s.severity === 'ok') parts.unshift(t('zone.sum.calm', lang));
  return parts.join(' · ');
}

