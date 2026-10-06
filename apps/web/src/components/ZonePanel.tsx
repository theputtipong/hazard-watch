'use client';

import { activeRegions, isBangkokZone, rank, type ZoneSummary } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';
import { describe, levelName, zoneLabel } from '@/lib/zoneText';
import type { ZoneView } from '@/lib/useZones';
import { canShare } from '@/lib/share';
import { SeverityPill } from './Severity';
import { ShareButton } from './ShareButton';

function Status({ s, lang }: { s: ZoneSummary | undefined; lang: Lang }) {
  if (!s || s.severity === null) {
    return <span className="inline-flex rounded-full bg-surface-sunken px-2.5 py-0.5 text-caption font-semibold text-ink-muted">{t('zone.noData', lang)}</span>;
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
    <div className="flex flex-col gap-3 border-t border-line px-3.5 py-3">
      {(zones.path.length > 0 || zones.selected) && (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={zones.back} className="min-h-10 rounded-full border border-line-control bg-surface px-3.5 text-body font-medium">
          ‹ {t('common.back', lang)}
        </button>
        <nav aria-label={t('area.nav', lang)} className="flex flex-wrap items-center gap-1 text-title">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1 && !zones.selected;
            return (
              <span key={c.depth} className="flex items-center gap-1">
                {i > 0 && <span aria-hidden="true" className="text-ink-muted">›</span>}
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
              <span aria-hidden="true" className="text-ink-muted">›</span>
              <span aria-current="page" className="font-bold">
                {zoneLabel(zones.selected, lang)}
              </span>
            </span>
          )}
        </nav>
      </div>
      )}

      <div className="flex flex-col gap-1 rounded-card bg-bg px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-title">{focus ? zoneLabel(focus, lang) : regionName}</strong>
          <Status s={zones.focusSummary} lang={lang} />
        </div>
        <p className="text-title leading-relaxed">{describe(zones.focusSummary, lang)}</p>
        {canShare(focus) && <ShareButton lang={lang} zone={focus} summary={zones.focusSummary} />}
      </div>

      {zones.visible.length > 0 ? (
        <div>
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <h3 className="text-body font-semibold">{t('zone.list', lang, { level: levelName(childLevel, bangkok, lang) })}</h3>
            <span className="text-caption text-ink-muted">
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
                    className={`flex min-h-13 w-full items-center gap-2 rounded-card border bg-surface px-3 py-1.5 text-left text-body ${
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
                      <span aria-hidden="true" className="text-title text-ink-muted">
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
        <p className="text-body text-ink-muted">{t('zone.noChildren', lang, { level: levelName(childLevel, bangkok, lang) })}</p>
      )}
    </div>
  );
}
