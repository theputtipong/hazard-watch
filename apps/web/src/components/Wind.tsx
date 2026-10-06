import { compassPoint, DEFAULT_CONFIG, type WeatherNow } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';
import { WEB } from '@/config';

const kmh = (n: number) => `${Math.round(n)} ${DEFAULT_CONFIG.units.windSpeed}`;

/** Arrow pointing where the wind blows TO (meteorological direction is where it comes FROM). */
export function WindArrow({ fromDeg, size = 18 }: { fromDeg: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${fromDeg + 180}deg)` }} className="shrink-0">
      <path d="M12 2 L19 20 L12 16 L5 20 Z" fill="currentColor" />
    </svg>
  );
}

/** "from the northeast · 4 km/h · gusts 20 km/h" for the weather card, or null when Open-Meteo sent no wind. */
export function SurfaceWind({ lang, weather }: { lang: Lang; weather: WeatherNow }) {
  const { windFromDeg: from, windSpeedKmh: speed, windGustKmh: gust } = weather;
  if (from == null || speed == null) return null;
  return (
    <div className="col-span-2">
      <dt>{t('weather.wind', lang)}</dt>
      <dd className="flex items-center gap-1.5 text-body text-ink">
        <WindArrow fromDeg={from} />
        <span>
          {t('weather.windFrom', lang, { dir: t(`compass.${compassPoint(from)}`, lang) })} · <span className="num">{kmh(speed)}</span>
          {gust != null && gust > speed && (
            <span className="text-ink-muted">
              {' '}
              · {t('weather.gust', lang, { speed: kmh(gust) })}
            </span>
          )}
        </span>
      </dd>
    </div>
  );
}

/** Map badge over the radar: which way rain is likely drifting, from the ~3 km steering wind. */
export function RadarDrift({ lang, weather }: { lang: Lang; weather: WeatherNow | null }) {
  const from = weather?.cloudWindFromDeg;
  const speed = weather?.cloudWindSpeedKmh;
  if (from == null || speed == null) return null;
  const calm = speed < WEB.map.driftCalmKmh;
  const note = t('radar.driftNote', lang);
  return (
    <div
      className="pointer-events-auto absolute right-2.5 bottom-8 z-[1000] flex max-w-[230px] items-center gap-2 rounded-card border border-line bg-surface/95 px-2.5 py-1.5 text-caption text-ink shadow-sm"
      title={note}
    >
      {!calm && <WindArrow fromDeg={from} size={26} />}
      <span>
        {calm ? t('radar.driftCalm', lang) : t('radar.drift', lang, { dir: t(`compass.${compassPoint(from + 180)}`, lang), speed: kmh(speed) })}
        <span className="sr-only"> ({note})</span>
      </span>
    </div>
  );
}
