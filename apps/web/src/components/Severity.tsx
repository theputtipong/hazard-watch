import { rank, type Severity } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';

/** Normal has no colour (design system SeverityBadge). */
const BADGE: Record<Severity, string> = {
  ok: 'bg-surface-sunken text-ink-muted',
  watch: 'bg-sev-watch-soft text-sev-watch-ink',
  warn: 'bg-sev-warning-soft text-sev-warning-ink',
  danger: 'bg-sev-danger-soft text-sev-danger-ink',
};

export function SeverityMeter({ severity, large = false }: { severity: Severity; large?: boolean }) {
  return (
    <span className={large ? 'hw-meter hw-meter--lg' : 'hw-meter'} data-level={rank(severity)} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

/** Always the word plus the meter, never colour alone. */
export function SeverityPill({ severity, lang, label }: { severity: Severity; lang: Lang; label?: string }) {
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-2 rounded-small px-2 text-label whitespace-nowrap ${BADGE[severity]}`}>
      <SeverityMeter severity={severity} />
      {label ?? t(`severity.${severity}`, lang)}
    </span>
  );
}

export const SeverityBadge = SeverityPill;
