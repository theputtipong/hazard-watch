import { DEFAULT_CONFIG, rank, type Severity } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';

/** Track covers 0–130 % of bank-full; higher readings fill the track but the figure stays real. */
const MAX_PCT = 130;
const FILL: Record<Severity, string> = { ok: 'bg-sev-normal', watch: 'bg-sev-watch', warn: 'bg-sev-warning', danger: 'bg-sev-danger' };
const PCT_TEXT: Record<Severity, string> = { ok: 'text-ink', watch: 'text-sev-watch-ink', warn: 'text-sev-warning-ink', danger: 'text-sev-danger-ink' };

/** How full a canal or river is: words first ("น้ำสูง ยังไม่ล้น · 86%"), ticks at the alert thresholds. */
export function RiverGauge({ lang, name, pct, severity, scale = false }: { lang: Lang; name: string; pct: number; severity: Severity; scale?: boolean }) {
  const w = DEFAULT_CONFIG.waterLevel;
  const ticks = [
    { at: w.watchPct, label: t('gauge.tick.watch', lang) },
    { at: w.warnPct, label: t('gauge.tick.warn', lang) },
    { at: w.dangerPct, label: t('gauge.tick.danger', lang) },
  ];
  const state = t(`gauge.state.${severity}`, lang);
  const v = Math.round(pct);
  const left = (p: number) => `${(Math.min(p, MAX_PCT) / MAX_PCT) * 100}%`;
  return (
    <div
      className="grid gap-2"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={MAX_PCT}
      aria-valuenow={Math.min(v, MAX_PCT)}
      aria-valuetext={`${name}: ${t('gauge.aria', lang, { state, v })}`}
      data-level={rank(severity)}
    >
      <div className="flex items-baseline justify-between gap-3 text-label">
        <span className="min-w-0 truncate">{name}</span>
        <span className={`num shrink-0 ${PCT_TEXT[severity]}`}>
          {state} · {v}%
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-surface-sunken" aria-hidden="true">
        <div className={`absolute inset-y-0 left-0 rounded-full ${FILL[severity]}`} style={{ width: left(pct) }} />
        {ticks.map((tk) => (
          <span key={tk.at} className="absolute -top-[3px] h-3.5 w-0.5 -translate-x-1/2 rounded-tiny bg-line-control" style={{ left: left(tk.at) }} />
        ))}
      </div>
      {scale && (
        <div className="relative h-[18px] text-caption text-ink-muted" aria-hidden="true">
          {ticks.map((tk) => (
            <span key={tk.at} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: left(tk.at) }}>
              {tk.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
