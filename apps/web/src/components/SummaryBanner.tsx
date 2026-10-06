import type { ZoneSummary } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';
import { SeverityPill } from './Severity';
import { describe } from '@/lib/zoneText';

const TONE = { ok: 'bg-surface-sunken', watch: 'bg-sev-watch-soft', warn: 'bg-sev-warning-soft', danger: 'bg-sev-danger-soft' } as const;

interface Line {
  label: string;
  area: string;
  summary: ZoneSummary;
}

export function SummaryBanner({ lang, lines }: { lang: Lang; lines: Line[] }) {
  const top = lines[0];
  if (!top) return null;
  return (
    <section
      aria-label={t('area.now', lang)}
      className={`flex basis-full flex-col gap-2 rounded-card max-lg:order-first border border-line px-4 py-3 ${top.summary.severity ? TONE[top.summary.severity] : 'bg-surface'}`}
    >
      {lines.map((l) => (
        <div key={l.label} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <strong className="text-title">
            {l.label} · {l.area}
          </strong>
          {l.summary.severity ? (
            <SeverityPill severity={l.summary.severity} lang={lang} />
          ) : (
            <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-caption font-semibold text-ink-muted">{t('zone.noData', lang)}</span>
          )}
          <p className="basis-full text-title leading-relaxed">{describe(l.summary, lang)}</p>
        </div>
      ))}
    </section>
  );
}
