import { DEFAULT_CONFIG, quakeAlertFloor, quakePlace, type Earthquake, type Observation, type Severity, type WeatherNow, type ZoneSummary } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';

interface Input {
  lang: Lang;
  area: string;
  updatedAt: string | null;
  weather: WeatherNow | null;
  pm: (Observation & { km: number }) | null;
  flood: { available: boolean; flooded: number; minor: number; nearest: (Observation & { km: number }) | null };
  water: (Observation & { km: number }) | null;
  quakes: { available: boolean; alerts: { quake: Earthquake; km: number }[] };
  focus: { name: string; summary: ZoneSummary } | null;
}

const status = (s: Severity, lang: Lang) => t(`severity.${s}`, lang);
const n1 = (v: number) => (Math.round(v * 10) / 10).toString();

/** Units spoken as words (no "µg/m³"), numbers rounded, and every topic says "no data" rather than going silent. */
export function spokenSummary(d: Input): string {
  const { lang } = d;
  const cfg = DEFAULT_CONFIG;
  const time = d.updatedAt
    ? new Date(d.updatedAt).toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })
    : '-';
  const out = [t('speak.intro', lang, { area: d.area, time })];

  if (d.focus) {
    const s = d.focus.summary.severity;
    out.push(t('speak.area', lang, { name: d.focus.name, status: s ? status(s, lang) : t('zone.noData', lang) }));
  }

  out.push(
    d.weather?.temperatureC != null
      ? t('speak.weather', lang, { temp: Math.round(d.weather.temperatureC), hum: Math.round(d.weather.humidityPct ?? 0) })
      : t('speak.noData', lang, { topic: t('card.weather', lang) }),
  );

  out.push(
    d.pm?.value != null
      ? t('speak.pm25', lang, { name: d.pm.name[lang], value: n1(d.pm.value), status: status(d.pm.severity, lang) })
      : t('speak.noData', lang, { topic: t('card.pm25', lang) }),
  );

  if (d.flood.available) {
    out.push(t('speak.flood', lang, { flooded: d.flood.flooded, minor: d.flood.minor }));
    if (d.flood.nearest) out.push(t('speak.floodNearest', lang, { name: d.flood.nearest.name[lang], km: n1(d.flood.nearest.km) }));
  } else out.push(t('speak.noData', lang, { topic: t('card.flood', lang) }));

  out.push(
    d.water?.value != null
      ? t('speak.water', lang, { name: d.water.name[lang], value: Math.round(d.water.value), status: status(d.water.severity, lang) })
      : t('speak.noData', lang, { topic: t('card.water', lang) }),
  );

  if (!d.quakes.available) out.push(t('speak.noData', lang, { topic: t('card.quake', lang) }));
  else if (d.quakes.alerts.length) {
    for (const { quake, km } of d.quakes.alerts) {
      out.push(t('speak.quakeAlert', lang, { mag: quake.magnitude.toFixed(1), place: quakePlace(quake, lang), km: Math.round(km) }));
    }
  } else {
    const floor = quakeAlertFloor(cfg);
    out.push(t('speak.quakeNone', lang, { mag: floor.minMagnitude.toFixed(1), km: floor.maxDistanceKm, days: cfg.quake.lookbackHours / 24 }));
  }

  return out.join(lang === 'th' ? '  ' : ' ');
}
