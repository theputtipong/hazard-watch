import { DEFAULT_CONFIG, pm25Severity, worst, type Earthquake, type Observation, type WeatherNow } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';
import { Card } from './Card';
import { SeverityPill } from './Severity';

const cfg = DEFAULT_CONFIG;
const fmt = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? '–' : n.toFixed(digits));
const placeName = (o: { name: { th: string; en: string } }, lang: Lang) => o.name[lang] || o.name.th;

export function WeatherCard({ lang, weather }: { lang: Lang; weather: WeatherNow | null }) {
  return (
    <Card title={t('card.weather', lang)} source={t('source.weather', lang)}>
      {weather ? (
        <>
          <span className="num text-[40px] leading-none">{fmt(weather.temperatureC)}°</span>
          <dl className="grid grid-cols-2 gap-2 text-xs text-muted">
            <div>
              <dt>{t('weather.humidity', lang)}</dt>
              <dd className="num text-base text-ink">{fmt(weather.humidityPct, 0)}%</dd>
            </div>
            <div>
              <dt>{t('weather.rainNow', lang)}</dt>
              <dd className="num text-base text-ink">{fmt(weather.precipitationMm)} mm</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="text-sm text-muted">{t('common.noData', lang)}</p>
      )}
    </Card>
  );
}

export function Pm25Card({ lang, station }: { lang: Lang; station: (Observation & { km: number }) | null }) {
  const value = station?.value ?? null;
  return (
    <Card
      title={t('card.pm25', lang)}
      status={value !== null && <SeverityPill severity={pm25Severity(value, cfg)} lang={lang} />}
      source={t('source.pm25', lang)}
    >
      {station && value !== null ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="num text-[40px] leading-none">{fmt(value)}</span>
            <span className="text-sm text-muted">µg/m³</span>
          </div>
          <p className="text-[13px] text-ink-2">
            {t('pm25.nearest', lang, { name: placeName(station, lang) })} · <span className="num">{fmt(station.km)} km</span>
          </p>
          <p className="flex flex-wrap justify-between gap-2 text-xs text-muted">
            <span>{t('pm25.who', lang, { value: cfg.pm25.bands.ok })}</span>
            <span>{t('pm25.pushAt', lang, { value: cfg.pm25.pushAt })}</span>
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">{t('common.noData', lang)}</p>
      )}
    </Card>
  );
}

export function FloodCard({
  lang,
  counts,
  nearestFlooded,
  available,
}: {
  lang: Lang;
  counts: { flooded: number; minor: number; normal: number; offline: number };
  nearestFlooded: (Observation & { km: number }) | null;
  available: boolean;
}) {
  const severity = counts.flooded ? 'warn' : counts.minor ? 'watch' : 'ok';
  return (
    <Card
      id="flood"
      title={t('card.flood', lang)}
      status={available && <SeverityPill severity={severity} lang={lang} />}
      source={t('source.flood', lang)}
    >
      {available ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat value={counts.flooded} label={t('flood.flooded', lang)} className="bg-danger text-danger-strong" />
            <Stat value={counts.minor} label={t('flood.minor', lang)} className="bg-watch text-watch-strong" />
            <Stat value={counts.normal} label={t('flood.normal', lang)} className="bg-[#eef1f4] text-ink" />
          </div>
          {nearestFlooded && (
            <p className="flex justify-between gap-2 text-[13px] text-ink-2">
              <span>
                {t('flood.nearest', lang)}: {placeName(nearestFlooded, lang)}
              </span>
              <span className="num">{fmt(nearestFlooded.km)} km</span>
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">{t('common.noData', lang)}</p>
      )}
    </Card>
  );
}

function Stat({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div className={`rounded-[10px] px-2.5 py-2 ${className}`}>
      <span className="num text-2xl">{value}</span>
      <br />
      <span className="text-xs">{label}</span>
    </div>
  );
}

export function QuakeCard({
  lang,
  alerts,
  latest,
}: {
  lang: Lang;
  alerts: { quake: Earthquake; severity: 'ok' | 'watch' | 'warn' | 'danger'; km: number }[];
  latest: { quake: Earthquake; km: number } | null;
}) {
  const severity = worst(alerts.map((a) => a.severity));
  const time = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
  return (
    <Card title={t('card.quake', lang)} status={<SeverityPill severity={severity} lang={lang} />} source={t('source.quake', lang)}>
      {alerts.length ? (
        <ul className="flex flex-col gap-1 text-sm">
          {alerts.map(({ quake, km }) => (
            <li key={quake.id} className="flex justify-between gap-2">
              <span>{quake.place[lang]}</span>
              <span className="num">
                M{quake.magnitude.toFixed(1)} · {Math.round(km)} km
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm">
          {t('quake.none', lang, { mag: cfg.quake.minMagnitude.toFixed(1), km: cfg.quake.radiusKm.toLocaleString(), days: cfg.quake.lookbackHours / 24 })}
        </p>
      )}
      {latest && (
        <p className="flex justify-between gap-2 border-t border-[#eef1f4] pt-2 text-[13px] text-muted">
          <span>
            {t('quake.latest', lang)}: {latest.quake.place[lang]}
          </span>
          <span className="num">
            M{latest.quake.magnitude.toFixed(1)} · {time(latest.quake.occurredAt)}
          </span>
        </p>
      )}
    </Card>
  );
}
