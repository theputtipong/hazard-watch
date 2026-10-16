import { NASA_ATTRIBUTION, type NasaNear } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';
import { Card } from './Card';

const km = (v: number) => (v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString());

/**
 * Fires and open NASA events near the chosen area. Display only: satellite data lags hours and is never an alert,
 * so there is no severity pill. Nothing near → one quiet line instead of a full card.
 */
export function NasaCard({ lang, near, updatedAt, note }: { lang: Lang; near: NasaNear | null; updatedAt?: string | null; note?: string }) {
  if (!near) return null;
  const { fires, events } = near;
  const quiet = fires.count === 0 && events.length === 0;
  const time = updatedAt
    ? new Date(updatedAt).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Bangkok',
      })
    : null;
  return (
    <Card
      id="nasa"
      title={t('nasa.card.title', lang)}
      source={`${NASA_ATTRIBUTION.firms} · ${NASA_ATTRIBUTION.eonet}${time ? ` · ${t('common.updated', lang)} ${time}` : ''}`}
      note={note}
    >
      {fires.count > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-body text-ink">
            {t('nasa.fires.count', lang, { n: fires.count.toLocaleString(), km: fires.radiusKm })}
          </p>
          {fires.nearestKm !== null && <p className="num text-caption text-ink-muted">{t('nasa.fires.nearest', lang, { km: km(fires.nearestKm) })}</p>}
        </div>
      ) : (
        <p className="text-body text-ink-muted">{t('nasa.fires.none', lang)}</p>
      )}
      {events.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-line pt-2 text-body">
          {events.map((e) => (
            <li key={e.id} className="flex justify-between gap-2">
              <span className="min-w-0">
                <strong className="font-semibold">{t(`nasa.event.${e.category}`, lang)}</strong> {e.title}
              </span>
              <span className="num shrink-0 text-ink-muted">{t('nasa.event.km', lang, { km: Math.round(e.km).toLocaleString() })}</span>
            </li>
          ))}
        </ul>
      )}
      {!quiet && <p className="text-caption text-ink-muted">{t('nasa.disclaimer', lang)}</p>}
    </Card>
  );
}
