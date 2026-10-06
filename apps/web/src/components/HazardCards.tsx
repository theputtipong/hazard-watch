import { DEFAULT_CONFIG, pm25Severity, quakeAlertFloor, quakePlace, quakePlaceHasDistance, worst, type Earthquake, type Observation, type WeatherNow } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';
import { NoData } from '@/lib/loadState';
import { Card } from './Card';
import { SeverityPill } from './Severity';
import { SurfaceWind } from './Wind';

const cfg = DEFAULT_CONFIG;
const u = cfg.units;
const fmt = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? '–' : n.toFixed(digits));
const placeName = (o: { name: { th: string; en: string } }, lang: Lang) => o.name[lang] || o.name.th;

export function WeatherCard({ lang, weather }: { lang: Lang; weather: WeatherNow | null }) {
  return (
    <Card title={t('card.weather', lang)} source={t('source.weather', lang)}>
      {weather ? (
        <>
          <span className="num text-figure leading-none">
            {fmt(weather.temperatureC)}
            {u.temperature}
          </span>
          <dl className="grid grid-cols-2 gap-2 text-caption text-muted">
            <div>
              <dt>{t('weather.humidity', lang)}</dt>
              <dd className="num text-title text-ink">
                {fmt(weather.humidityPct, 0)}
                {u.humidity}
              </dd>
            </div>
            <div>
              <dt>{t('weather.rainNow', lang)}</dt>
              <dd className="num text-title text-ink">
                {fmt(weather.precipitationMm)} {u.precipitation}
              </dd>
            </div>
            <SurfaceWind lang={lang} weather={weather} />
          </dl>
        </>
      ) : (
        <NoData lang={lang} />
      )}
    </Card>
  );
}

export function Pm25Card({ lang, station, note }: { lang: Lang; station: (Observation & { km: number }) | null; note?: string }) {
  const value = station?.value ?? null;
  return (
    <Card
      title={t('card.pm25', lang)}
      status={value !== null && <SeverityPill severity={pm25Severity(value, cfg)} lang={lang} />}
      source={t('source.pm25', lang)}
      note={note}
    >
      {station && value !== null ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="num text-figure leading-none">{fmt(value)}</span>
            <span className="text-body text-muted">{station.unit || u.pm25}</span>
          </div>
          <p className="text-body text-ink-2">
            {t('pm25.nearest', lang, { name: placeName(station, lang) })} · <span className="num">
              {fmt(station.km)} {u.distance}
            </span>
          </p>
          <p className="flex flex-wrap justify-between gap-2 text-caption text-muted">
            <span>{t('pm25.who', lang, { value: cfg.pm25.bands.ok })}</span>
            <span>{t('pm25.pushAt', lang, { value: cfg.pm25.pushAt })}</span>
          </p>
        </>
      ) : (
        <NoData lang={lang} />
      )}
    </Card>
  );
}

export function FloodCard({
  lang,
  counts,
  nearestFlooded,
  available,
  note,
}: {
  note?: string;
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
      note={note}
    >
      {available ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat value={counts.flooded} label={t('flood.flooded', lang)} className="bg-danger text-danger-strong" />
            <Stat value={counts.minor} label={t('flood.minor', lang)} className="bg-watch text-watch-strong" />
            <Stat value={counts.normal} label={t('flood.normal', lang)} className="bg-sunken text-ink" />
          </div>
          {nearestFlooded && (
            <p className="flex justify-between gap-2 text-body text-ink-2">
              <span>
                {t('flood.nearest', lang)}: {placeName(nearestFlooded, lang)}
              </span>
              <span className="num">
                {fmt(nearestFlooded.km)} {u.distance}
              </span>
            </p>
          )}
        </>
      ) : (
        <NoData lang={lang} />
      )}
    </Card>
  );
}

function Stat({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div className={`rounded-box px-2.5 py-2 ${className}`}>
      <span className="num text-display">{value}</span>
      <br />
      <span className="text-caption">{label}</span>
    </div>
  );
}

export function QuakeCard({
  lang,
  alerts,
  latest,
  available,
  note,
}: {
  note?: string;
  lang: Lang;
  available: boolean;
  alerts: { quake: Earthquake; severity: 'ok' | 'watch' | 'warn' | 'danger'; km: number }[];
  latest: { quake: Earthquake; km: number } | null;
}) {
  const severity = worst(alerts.map((a) => a.severity));
  const floor = quakeAlertFloor(cfg);
  const time = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
  return (
    <Card title={t('card.quake', lang)} status={available && <SeverityPill severity={severity} lang={lang} />} source={t('source.quake', lang)} note={note}>
      {!available ? (
        <NoData lang={lang} />
      ) : alerts.length ? (
        <ul className="flex flex-col gap-1 text-body">
          {alerts.map(({ quake, km }) => (
            <li key={quake.id} className="flex justify-between gap-2">
              <span>{quakePlace(quake, lang, km)}</span>
              <span className="num shrink-0">
                M{quake.magnitude.toFixed(1)}
                {/* Thai USGS names already say how far away it is. */}
                {!quakePlaceHasDistance(quake, lang) && ` · ${Math.round(km)} ${u.distance}`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body">
          {t('quake.none', lang, { mag: floor.minMagnitude.toFixed(1), km: floor.maxDistanceKm.toLocaleString(), days: cfg.quake.lookbackHours / 24 })}
        </p>
      )}
      {latest && (
        <p className="flex justify-between gap-2 border-t border-sunken pt-2 text-body text-muted">
          <span>
            {t('quake.latest', lang)}: {quakePlace(latest.quake, lang, latest.km)}
          </span>
          <span className="num shrink-0">
            M{latest.quake.magnitude.toFixed(1)} · {time(latest.quake.occurredAt)}
          </span>
        </p>
      )}
    </Card>
  );
}

export function WaterLevelCard({
  lang,
  nearest,
  high,
  note,
}: {
  lang: Lang;
  nearest: (Observation & { km: number }) | null;
  /** Gauges at or above the watch level, highest first. */
  high: Observation[];
  note?: string;
}) {
  const severity = worst(high.map((o) => o.severity));
  return (
    <Card
      title={t('card.water', lang)}
      status={nearest && <SeverityPill severity={severity} lang={lang} />}
      source={t('source.water', lang)}
      note={note}
    >
      {nearest ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="num text-figure leading-none">{fmt(nearest.value, 0)}</span>
            <span className="text-body text-muted">
              {nearest.unit} {t('water.ofBank', lang)}
            </span>
          </div>
          <p className="text-body text-ink-2">
            {t('water.nearest', lang, { name: placeName(nearest, lang) })} ·{' '}
            <span className="num">
              {fmt(nearest.km)} {u.distance}
            </span>
          </p>
          <div className="border-t border-sunken pt-2 text-body">
            <p className="mb-1 text-muted">{t('water.high', lang, { pct: cfg.waterLevel.watchPct })}</p>
            {high.length ? (
              <ul className="flex flex-col gap-1">
                {high.slice(0, 3).map((o) => (
                  <li key={o.id} className="flex justify-between gap-2">
                    <span>{placeName(o, lang)}</span>
                    <span className="num">
                      {fmt(o.value, 0)}
                      {o.unit}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t('water.none', lang)}</p>
            )}
          </div>
        </>
      ) : (
        <NoData lang={lang} />
      )}
    </Card>
  );
}
