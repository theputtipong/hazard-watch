import type { Severity } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';

const PILL: Record<Severity, string> = {
  ok: 'bg-ok text-ok-strong',
  watch: 'bg-watch text-watch-strong',
  warn: 'bg-warn text-warn-strong',
  danger: 'bg-danger text-danger-strong',
};

/** Status is always written out, never colour alone. */
export function SeverityPill({ severity, lang, label }: { severity: Severity; lang: Lang; label?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-semibold ${PILL[severity]}`}>
      {label ?? t(`severity.${severity}`, lang)}
    </span>
  );
}
