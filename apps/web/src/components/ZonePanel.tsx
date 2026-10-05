'use client';

import { activeRegions, DEFAULT_CONFIG, isBangkokZone, rank, type ZoneFeature, type ZoneSummary } from '@hw/core';
import { t, type Lang, type MessageKey } from '@hw/core/i18n';
import type { ZoneView } from '@/lib/useZones';
import { SeverityPill } from './Severity';

const u = DEFAULT_CONFIG.units;

/** "เขต" in Bangkok, "อำเภอ" elsewhere (and the same for แขวง/ตำบล). */
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

/** Plain-language one-liner for an area, e.g. "น้ำท่วม 2 จุด · ฝุ่นสูงสุด 24 µg/m³". */
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

function Status({ s, lang }: { s: ZoneSummary | undefined; lang: Lang }) {
  if (!s || s.severity === null) {
    return <span className="inline-flex rounded-full bg-sunken px-2.5 py-0.5 text-xs font-semibold text-muted">{t('zone.noData', lang)}</span>;
  }
  return <SeverityPill severity={s.severity} lang={lang} />;
}

export function ZonePanel({ lang, zones }: { lang: Lang; zones: ZoneView }) {
  if (!zones.ready) return null;
  const regionName = activeRegions().map((r) => r.name[lang]).join(', ');
  const bangkok = zones.path[0] ? isBangkokZone(zones.path[0].properties.id) : false;
  const childLevel = zones.path.length + 1;
  const focus = zones.selected ?? zones.path.at(-1) ?? null;
  const sorted = [...zones.visible].sort((a, b) => {
    const sa = zones.summaries.get(a.properties.id)?.severity;
    const sb = zones.summaries.get(b.properties.id)?.severity;
    // Most severe first; zones without sensors last.
    return (sb ? rank(sb) : -1) - (sa ? rank(sa) : -1) || a.properties.name_th.localeCompare(b.properties.name_th, 'th');
  });
  const crumbs = [{ label: regionName, depth: 0 }, ...zones.path.map((z, i) => ({ label: zoneLabel(z, lang), depth: i + 1 }))];

  return (
    <div className="flex flex-col gap-3 border-t border-line-soft px-3.5 py-3">
      {(zones.path.length > 0 || zones.selected) && (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={zones.back} className="min-h-10 rounded-full border border-chip-line bg-panel px-3.5 text-sm font-medium">
          ‹ {t('common.back', lang)}
        </button>
        <nav aria-label={t('area.nav', lang)} className="flex flex-wrap items-center gap-1 text-[15px]">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1 && !zones.selected;
            return (
              <span key={c.depth} className="flex items-center gap-1">
                {i > 0 && <span aria-hidden="true" className="text-faint">›</span>}
                {last ? (
                  <span aria-current="page" className="font-bold">
                    {c.label}
                  </span>
                ) : (
                  <button type="button" onClick={() => zones.goTo(c.depth)} className="min-h-11 px-1 text-accent underline underline-offset-4">
                    {c.label}
                  </button>
                )}
              </span>
            );
          })}
          {zones.selected && (
            <span className="flex items-center gap-1">
              <span aria-hidden="true" className="text-faint">›</span>
              <span aria-current="page" className="font-bold">
                {zoneLabel(zones.selected, lang)}
              </span>
            </span>
          )}
        </nav>
      </div>
      )}

      <div className="flex flex-col gap-1 rounded-xl bg-ground px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-[15px]">{focus ? zoneLabel(focus, lang) : regionName}</strong>
          <Status s={zones.focusSummary} lang={lang} />
        </div>
        <p className="text-[15px] leading-relaxed">{describe(zones.focusSummary, lang)}</p>
      </div>

      {zones.visible.length > 0 ? (
        <div>
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <h3 className="text-sm font-semibold">{t('zone.list', lang, { level: levelName(childLevel, bangkok, lang) })}</h3>
            <span className="text-xs text-muted">
              {t('area.sortNote', lang)} · {t('zone.tapHint', lang)}
            </span>
          </div>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
            {sorted.map((z) => {
              const s = zones.summaries.get(z.properties.id);
              const current = zones.selected?.properties.id === z.properties.id;
              return (
                <li key={z.properties.id}>
                  <button
                    type="button"
                    onClick={() => zones.open(z.properties.id)}
                    aria-current={current || undefined}
                    className={`flex min-h-13 w-full items-center gap-2 rounded-[10px] border bg-panel px-3 py-1.5 text-left text-sm ${
                      current ? 'border-ink shadow-[inset_0_0_0_1px_var(--color-ink)]' : 'border-line'
                    }`}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{z.properties[lang === 'th' ? 'name_th' : 'name_en']}</span>
                      <span className="mt-0.5">
                        <Status s={s} lang={lang} />
                      </span>
                    </span>
                    {zones.hasChildren(z.properties.id) && (
                      <span aria-hidden="true" className="text-lg text-muted">
                        ›
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted">{t('zone.noChildren', lang, { level: levelName(childLevel, bangkok, lang) })}</p>
      )}
    </div>
  );
}
