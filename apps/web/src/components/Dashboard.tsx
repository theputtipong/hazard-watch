'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { activeRegions, DEFAULT_CONFIG, isStale, RADARS, regionRadars, type DashboardSnapshot, type WeatherNow } from '@hw/core';
import { t, type Lang, type MessageKey } from '@hw/core/i18n';
import { WEB } from '@/config';
import { fetchSnapshot, fetchWeather } from '@/lib/api';
import { floodCounts, nearest, quakeSummary, uniqueBy } from '@/lib/derive';
import { feedFreshness, freshnessNote } from '@/lib/freshness';
import { useLocation } from '@/lib/useLocation';
import { useZones } from '@/lib/useZones';
import { mapPalette, usePrefs } from '@/lib/prefs';
import { useSpeech } from '@/lib/speech';
import { spokenSummary } from '@/lib/spokenSummary';
import { A11yControls } from './A11yControls';
import { zoneLabel } from './ZonePanel';
import { ZonePanel } from './ZonePanel';
import { CctvList } from './CctvList';
import { FloodCard, Pm25Card, QuakeCard, WaterLevelCard, WeatherCard } from './HazardCards';
import { Header } from './Header';
import type { LayerKey, Layers } from '@/lib/layers';

const MapView = dynamic(() => import('./MapView'), { ssr: false, loading: () => <div className="h-[420px] bg-map-bg sm:h-[520px]" /> });

const LAYER_LABEL: Record<LayerKey, MessageKey> = { zones: 'zone.layer', radar: 'layer.radar', flood: 'layer.flood', water: 'layer.water', pm25: 'layer.pm25', cctv: 'layer.cctv' };

export function Dashboard({ lang }: { lang: Lang }) {
  const { location, status, locate } = useLocation();
  const { prefs, cycleTheme, toggleCvd } = usePrefs();
  const palette = useMemo(() => mapPalette(prefs), [prefs]);
  const speech = useSpeech(lang);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  /** Clock reading taken when the snapshot arrives (keeps render pure). */
  const [loadedAt, setLoadedAt] = useState(0);
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [layers, setLayers] = useState<Layers>({ ...WEB.map.defaultLayers });
  const [radarId, setRadarId] = useState<string>(WEB.map.defaultRadar);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchSnapshot()
        .then((s) => {
          if (!alive) return;
          setSnapshot(s);
          setLoadedAt(Date.now());
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, WEB.refreshMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    fetchWeather(location).then(setWeather).catch(() => setWeather(null));
  }, [location]);

  const view = useMemo(() => {
    const pm = snapshot?.edge?.feeds.pm25?.items ?? [];
    const flood = snapshot?.runner?.feeds.flood?.items ?? [];
    const cams = snapshot?.runner?.feeds.cctv?.items ?? [];
    const water = snapshot?.runner?.feeds.waterlevel?.items ?? [];
    const cfg = DEFAULT_CONFIG;
    const fresh = <T extends { observedAt: string }>(items: T[]) => items.filter((o) => !isStale(o.observedAt, cfg));
    const quakeFeeds = [snapshot?.edge?.feeds.quakesTmd, snapshot?.edge?.feeds.quakesUsgs];
    return {
      waterStations: water,
      nearestWater: nearest(fresh(water.filter((o) => o.value !== null)), location)[0] ?? null,
      highWater: fresh(water)
        .filter((o) => o.value !== null && o.value >= cfg.waterLevel.watchPct)
        .sort((a, b) => b.value! - a.value!),
      notes: {
        pm25: freshnessNote(feedFreshness(snapshot?.edge?.feeds.pm25, cfg), lang),
        flood: freshnessNote(feedFreshness(snapshot?.runner?.feeds.flood, cfg), lang),
        water: freshnessNote(feedFreshness(snapshot?.runner?.feeds.waterlevel, cfg), lang),
        // Quakes: only warn when both sources failed.
        quake: quakeFeeds.every((f) => f && !f.ok)
          ? freshnessNote(feedFreshness(quakeFeeds[0], cfg, new Date(), () => undefined), lang)
          : undefined,
      },
      pmStations: pm,
      // Nearest station with a current reading; old readings are not shown as the local value.
      nearestPm: nearest(fresh(pm.filter((s) => s.value !== null)), location)[0] ?? null,
      floodPoints: flood,
      // A feed counts as available only if it has data; a failed fetch must never read as "normal".
      floodAvailable: fresh(flood).length > 0,
      quakeAvailable: !!(snapshot?.edge?.feeds.quakesTmd?.items.length || snapshot?.edge?.feeds.quakesUsgs?.items.length),
      // Counts and the nearest flooded spot use current readings only; old ones are just faded on the map.
      counts: floodCounts(fresh(flood)),
      nearestFlooded: nearest(fresh(flood).filter((p) => !p.offline && (p.severity === 'warn' || p.severity === 'danger')), location)[0] ?? null,
      cameras: cams,
      // Several cameras often share one junction name; list each junction once.
      nearCams: uniqueBy(nearest(cams, location, cams.length), (c) => c.name.th).slice(0, WEB.nearbyCameras),
      quakes: quakeSummary(snapshot, location, DEFAULT_CONFIG),
    };
  }, [snapshot, location, lang]);

  const readings = useMemo(
    () => [
      ...(snapshot?.runner?.feeds.flood?.items ?? []),
      ...(snapshot?.runner?.feeds.rain?.items ?? []),
      ...(snapshot?.runner?.feeds.waterlevel?.items ?? []),
      ...(snapshot?.edge?.feeds.pm25?.items ?? []),
    ],
    [snapshot],
  );
  const zones = useZones(readings);

  const updatedAt = [snapshot?.edge?.updatedAt, snapshot?.runner?.updatedAt].filter(Boolean).sort().at(-1) ?? null;
  const focusZone = zones.selected ?? zones.path.at(-1) ?? null;
  const spoken = useMemo(
    () =>
      spokenSummary({
        lang,
        area: activeRegions().map((r) => r.name[lang]).join(', '),
        updatedAt,
        weather,
        pm: view.nearestPm,
        flood: { available: view.floodAvailable, flooded: view.counts.flooded, minor: view.counts.minor, nearest: view.nearestFlooded },
        water: view.nearestWater,
        quakes: { available: view.quakeAvailable, alerts: view.quakes.alerts },
        focus: focusZone ? { name: zoneLabel(focusZone, lang), summary: zones.focusSummary } : null,
      }),
    [lang, updatedAt, weather, view, focusZone, zones.focusSummary],
  );
  const radarFrame = snapshot?.runner?.feeds.radar?.items.find((f) => f.radarId === radarId) ?? null;
  const radarOld = !!radarFrame && loadedAt - new Date(radarFrame.time).getTime() > WEB.map.radarStaleMinutes * 60_000;
  const clock = (iso: string) =>
    new Date(iso).toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
  const toggle = (key: LayerKey) => setLayers((l) => ({ ...l, [key]: !l[key] }));

  return (
    <>
      <a
        href="#summary"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[2000] focus:rounded-lg focus:bg-panel focus:px-3 focus:py-2"
      >
        {t('a11y.skip', lang)}
      </a>
      <Header lang={lang} updatedAt={updatedAt}>
        <A11yControls
          lang={lang}
          theme={prefs.theme}
          cvd={prefs.cvd}
          onTheme={cycleTheme}
          onCvd={toggleCvd}
          speech={speech}
          onListen={() => (speech.speaking ? speech.stop() : speech.speak(spoken))}
        />
      </Header>
      <main className="mx-auto flex max-w-[1360px] flex-wrap items-start gap-5 px-4 py-5 sm:px-6">
        {/* Same text as read-aloud, for screen readers (blind users): one place with the whole picture. */}
        <section id="summary" tabIndex={-1} aria-label={t('a11y.summary', lang)} className="sr-only">
          <h2>{t('a11y.summary', lang)}</h2>
          <p>{spoken}</p>
        </section>
        {status === 'denied' && <p className="basis-full rounded-xl bg-watch px-4 py-2 text-sm text-watch-strong">{t('location.denied', lang)}</p>}

        <section aria-label={t('map.title', lang)} className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-2xl border border-line bg-panel">
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3.5 py-3">
            <strong className="mr-1.5 text-[15px]">{t('map.layers', lang)}</strong>
            {(Object.keys(LAYER_LABEL) as LayerKey[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={layers[key]}
                onClick={() => toggle(key)}
                className={`min-h-10 rounded-full border px-3.5 text-sm font-medium ${
                  layers[key] ? 'border-ink bg-ink text-panel' : 'border-chip-line bg-panel text-ink-2'
                }`}
              >
                {t(LAYER_LABEL[key], lang)}
              </button>
            ))}
          </div>
          <MapView
            lang={lang}
            center={location}
            located={status === 'granted'}
            onLocate={locate}
            layers={layers}
            radarId={radarId}
            radarTime={radarFrame?.time ?? null}
            floodPoints={view.floodPoints}
            pmStations={view.pmStations}
            cameras={view.cameras}
            waterStations={view.waterStations}
            zones={zones}
            palette={palette}
          />
          {layers.radar && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-3.5 py-2.5 text-sm">
              <label htmlFor="radar-src" className="text-muted">
                {t('radar.source', lang)}
              </label>
              <select
                id="radar-src"
                value={radarId}
                onChange={(e) => setRadarId(e.target.value)}
                className="min-h-10 rounded-lg border border-chip-line bg-panel px-2.5 text-ink"
              >
                {regionRadars(activeRegions())
                  .filter((id) => RADARS[id])
                  .map((id) => (
                    <option key={id} value={id}>
                      {RADARS[id]!.name[lang]}
                    </option>
                  ))}
              </select>
              <span className={radarOld ? 'rounded-md bg-watch px-2 py-0.5 text-xs text-watch-strong' : 'text-xs text-muted'}>
                {radarFrame
                  ? t(radarOld ? 'radar.old' : 'radar.frame', lang, { time: clock(radarFrame.time) })
                  : t('radar.none', lang)}
              </span>
            </div>
          )}
          <ZonePanel lang={lang} zones={zones} />
        </section>

        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-3.5 max-lg:order-first">
          <WeatherCard lang={lang} weather={weather} />
          <Pm25Card lang={lang} station={view.nearestPm} note={view.notes.pm25} />
          <FloodCard lang={lang} counts={view.counts} nearestFlooded={view.nearestFlooded} available={view.floodAvailable} note={view.notes.flood} />
          <QuakeCard lang={lang} alerts={view.quakes.alerts} latest={view.quakes.latestRegional} available={view.quakeAvailable} note={view.notes.quake} />
          <WaterLevelCard lang={lang} nearest={view.nearestWater} high={view.highWater} note={view.notes.water} />
        </aside>

        <div className="basis-full">
          <CctvList lang={lang} cameras={view.nearCams} />
        </div>
      </main>
      <footer className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-4 px-4 pb-8 text-xs text-muted sm:px-6">
        <span className="flex flex-[1_1_520px] flex-col gap-1">
          <span>{t('app.coverage', lang, { regions: activeRegions().map((r) => r.name[lang]).join(', ') })}</span>
          <span>{t('footer.credits', lang)}</span>
        </span>
        <a
          href={WEB.donateUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center rounded-full bg-[#ffdd00] px-3.5 font-semibold text-[#0f1b2d]"
        >
          {t('footer.coffee', lang)}
        </a>
      </footer>
    </>
  );
}
