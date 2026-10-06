import { rank, type Severity } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';

/** Soft background + ink text per level (design system SeverityBadge). Normal has no colour. */
const BADGE: Record<Severity, string> = {
  ok: 'bg-surface-sunken text-ink-muted',
  watch: 'bg-sev-watch-soft text-sev-watch-ink',
  warn: 'bg-sev-warning-soft text-sev-warning-ink',
  danger: 'bg-sev-danger-soft text-sev-danger-ink',
};

/** Three rising bars; the level is the number of filled bars, so it reads without colour. */
export function SeverityMeter({ severity, large = false }: { severity: Severity; large?: boolean }) {
  return (
    <span className={large ? 'hw-meter hw-meter--lg' : 'hw-meter'} data-level={rank(severity)} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

/** Level badge: always the word (ปกติ / ระวัง / ระวังมาก / อันตราย) plus the meter, never colour alone. */
export function SeverityPill({ severity, lang, label }: { severity: Severity; lang: Lang; label?: string }) {
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-2 rounded-small px-2 text-label whitespace-nowrap ${BADGE[severity]}`}>
      <SeverityMeter severity={severity} />
      {label ?? t(`severity.${severity}`, lang)}
    </span>
  );
}

export const SeverityBadge = SeverityPill;
