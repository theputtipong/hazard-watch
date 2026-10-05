import type { ZoneFeature, ZoneSummary } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';
import { WEB } from '@/config';
import { describe, zoneLabel } from '@/lib/zoneText';

/** Levels that can be shared (2 = เขต/อำเภอ, 3 = แขวง/ตำบล); see WEB.share. */
export const canShare = (z: ZoneFeature | null): z is ZoneFeature => !!z && WEB.share.levels.includes(z.properties.level);

/** Link that opens the dashboard focused on this area, in the given language. */
export const areaUrl = (id: string, lang: Lang) => `${WEB.siteUrl}/${lang}?area=${encodeURIComponent(id)}`;

export function shareContent(zone: ZoneFeature, summary: ZoneSummary, lang: Lang) {
  const area = zoneLabel(zone, lang);
  const status = summary.severity ? t(`severity.${summary.severity}`, lang) : t('zone.noData', lang);
  return {
    title: t('share.metaTitle', lang, { area, app: t('app.name', lang) }),
    text: t('share.text', lang, { area, status, detail: describe(summary, lang) }),
    url: areaUrl(zone.properties.id, lang),
  };
}

/** Share pages of the services offered when the device has no share sheet. */
export function shareTargets({ text, url }: { text: string; url: string }) {
  const u = encodeURIComponent(url);
  const both = encodeURIComponent(`${text}\n${url}`);
  return {
    line: `https://social-plugins.line.me/lineit/share?url=${u}&text=${both}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    x: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${u}`,
  };
}
