import { DEFAULT_CONFIG, SOURCE_META, type Severity } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';
import type { DamReading } from '@/lib/derive';
import { Card } from './Card';

const u = DEFAULT_CONFIG.units;
/** Track tops out at 120 % of normal storage; fuller dams fill it but the figure stays real. */
const MAX_PCT = 120;
const FILL: Record<Severity, string> = { ok: 'bg-sev-normal', watch: 'bg-sev-watch', warn: 'bg-sev-warning', danger: 'bg-sev-danger' };
const PCT_TEXT: Record<Severity, string> = { ok: 'text-ink', watch: 'text-sev-watch-ink', warn: 'text-sev-warning-ink', danger: 'text-sev-danger-ink' };

export const damName = (d: Pick<DamReading, 'name'>, lang: Lang) => d.name[lang] || d.name.th;
const num = (v: number | null, digits = 1) => (v === null ? '–' : v.toLocaleString('en-US', { maximumFractionDigits: digits }));
/** ThaiWater dam data is daily: `observedAt` is 00:00 ICT of the report day, so only the date is shown. */
export const damDate = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });

/** Storage bar with the status in words next to the figure, so colour is never the only cue. */
export function DamStorage({ lang, dam, name }: { lang: Lang; dam: DamReading; name?: string }) {
  const status = t(`dam.status.${dam.status}`, lang);
  const v = Math.round(dam.storagePct);
  return (
    <div
      className="grid gap-1.5"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={MAX_PCT}
      aria-valuenow={Math.min(v, MAX_PCT)}
      aria-valuetext={`${name ? `${name}: ` : ''}${t('dam.storagePct', lang, { pct: v })} · ${status}`}
    >
      <div className="flex items-baseline justify-between gap-3 text-label">
        <span className="text-ink-muted">{t('dam.storage', lang)}</span>
        <span className={`num shrink-0 ${PCT_TEXT[dam.severity]}`}>
          {status} · {v}%
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-surface-sunken" aria-hidden="true">
        <div className={`absolute inset-y-0 left-0 rounded-full ${FILL[dam.severity]}`} style={{ width: `${(Math.min(Math.max(dam.storagePct, 0), MAX_PCT) / MAX_PCT) * 100}%` }} />
        <span className="absolute -top-[3px] h-3.5 w-0.5 -translate-x-1/2 rounded-tiny bg-line-control" style={{ left: `${(100 / MAX_PCT) * 100}%` }} />
      </div>
    </div>
  );
}

/** Usable %, inflow, release and the data date; shared by the card and the map popup. */
export function DamFigures({ lang, dam }: { lang: Lang; dam: DamReading }) {
  const perDay = t('dam.unitMcmPerDay', lang);
  return (
    <>
      <dl className="grid grid-cols-3 gap-2 text-caption text-ink-muted">
        <div>
          <dt>{t('dam.usable', lang)}</dt>
          <dd className="num text-label text-ink">{dam.usablePct === null ? '–' : `${Math.round(dam.usablePct)}%`}</dd>
        </div>
        <div>
          <dt>{t('dam.inflow', lang)}</dt>
          <dd className="num text-label text-ink">{num(dam.inflowMcm, 2)}</dd>
        </div>
        <div>
          <dt>{t('dam.release', lang)}</dt>
          <dd className="num text-label text-ink">{num(dam.releaseMcm, 2)}</dd>
        </div>
      </dl>
      <p className="text-caption text-ink-muted">
        {t('dam.inflow', lang)}/{t('dam.release', lang)}: {perDay}
        {dam.capacityMcm !== null && (
          <>
            {' · '}
            {t('dam.capacity', lang)} <span className="num">{num(dam.capacityMcm, 0)}</span> {t('dam.unitMcm', lang)}
          </>
        )}
      </p>
      {dam.stale ? (
        // Data age is system status: neutral tone, never a sev-* colour.
        <p className="rounded-control bg-surface-sunken px-2.5 py-1.5 text-label text-ink">{t('fresh.stale', lang, { time: damDate(dam.observedAt, lang) })}</p>
      ) : (
        <p className="text-caption text-ink-muted">
          {t('popup.time', lang)} {damDate(dam.observedAt, lang)}
        </p>
      )}
    </>
  );
}

export function DamSourceLink({ lang }: { lang: Lang }) {
  return (
    <a
      href={SOURCE_META.thaiwater.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`ThaiWater, ${t('sources.openLink', lang)}`}
      className="inline-flex min-h-11 items-center self-start text-caption text-accent underline underline-offset-4"
    >
      {t('common.viewAtSource', lang)}: ThaiWater ↗
    </a>
  );
}

/**
 * Up to three ThaiWater dams for the chosen area (see pickDams). Display only: dams are never alerts, so there is
 * no severity pill and the card says so. Hidden when no dam is in range or the feed is missing.
 */
export function DamCard({ lang, dams, note }: { lang: Lang; dams: DamReading[]; note?: string }) {
  if (!dams.length) return null;
  return (
    <Card id="dams" title={t('card.dam', lang)} source={t('dam.credit', lang)} note={note}>
      <ul className="flex flex-col gap-3">
        {dams.map((d, i) => (
          <li key={d.id} className={`flex flex-col gap-2 ${i > 0 ? 'border-t border-line pt-3' : ''}`}>
            <p className="flex items-baseline justify-between gap-2">
              <span className="min-w-0">
                <strong className="text-body font-semibold">{damName(d, lang)}</strong>{' '}
                <span className="text-caption text-ink-muted">{t(`dam.size.${d.size}`, lang)}</span>
              </span>
              <span className="num shrink-0 text-caption text-ink-muted">
                {d.km < 10 ? d.km.toFixed(1) : Math.round(d.km).toLocaleString()} {u.distance}
              </span>
            </p>
            <DamStorage lang={lang} dam={d} name={damName(d, lang)} />
            <DamFigures lang={lang} dam={d} />
          </li>
        ))}
      </ul>
      <p className="text-caption text-ink-muted">{t('dam.note', lang)}</p>
      <DamSourceLink lang={lang} />
    </Card>
  );
}
