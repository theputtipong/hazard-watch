'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { activeRegions, DEFAULT_CONFIG, groupByZone, isStale, summarizeZone, zoneCenter, type DashboardSnapshot, type WeatherNow } from '@hw/core';
import { t, type Lang, type MessageKey } from '@hw/core/i18n';
import { WEB } from '@/config';
import { mapCredits } from '@/content/sources';
import { fetchSnapshot, fetchWeather } from '@/lib/api';
import { radarFor, radarGroups } from '@/lib/radar';
import { floodCounts, nearest, quakeSummary, uniqueBy } from '@/lib/derive';
import { feedFreshness, freshnessNote } from '@/lib/freshness';
import { useLocation } from '@/lib/useLocation';
import { useZones } from '@/lib/useZones';
import { loadPickedArea, savePickedArea } from '@/lib/pickedArea';
import { mapPalette, usePrefs } from '@/lib/prefs';
import { useSpeech } from '@/lib/speech';
import { spokenSummary } from '@/lib/spokenSummary';
import { A11yControls } from './A11yControls';
import { AlertsCard } from './AlertsCard';
import { registerServiceWorker } from '@/lib/push';
import { zoneLabel } from '@/lib/zoneText';
import { ZonePanel } from './ZonePanel';
import { SummaryBanner } from './SummaryBanner';
import { LoadStateContext, type LoadState } from '@/lib/loadState';
import { CctvList } from './CctvList';
import { FeedStatus } from './FeedStatus';
import { FloodCard, Pm25Card, QuakeCard, WaterLevelCard, WeatherCard } from './HazardCards';
import { Header } from './Header';
import { SourceLinks } from './SourceLinks';
import type { LayerKey, Layers } from '@/lib/layers';

const MapView = dynamic(() => import('./MapView'), { ssr: false, loading: () => <div className="h-[420px] bg-surface-sunken sm:h-[520px]" /> });

const LAYER_LABEL: Record<LayerKey, MessageKey> = { zones: 'zone.layer', radar: 'layer.radar', flood: 'layer.flood', water: 'layer.water', pm25: 'layer.pm25', cctv: 'layer.cctv' };

export function Dashboard({ lang, initialArea }: { lang: Lang; initialArea?: string | null }) {
  const { location: deviceLocation, status, locate } = useLocation();
  const { prefs, cycleTheme, toggleCvd } = usePrefs();
  const palette = useMemo(() => mapPalette(prefs), [prefs]);
  const speech = useSpeech(lang);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [retry, setRetry] = useState(0);
  /** Captured on arrival so render stays pure. */
  const [loadedAt, setLoadedAt] = useState(0);
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [layers, setLayers] = useState<Layers>({ ...WEB.map.defaultLayers });
  const [radarChoice, setRadarChoice] = useState<string | null>(null);
  const [radarFocus, setRadarFocus] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchSnapshot()
        .then((s) => {
          if (!alive) return;
          setSnapshot(s);
          setLoadedAt(Date.now());
          setLoadState('ready');
        })
        // Keep the last snapshot on screen; only flag that the service is unreachable.
        .catch(() => alive && setLoadState('error'));
    load();
    const timer = setInterval(load, WEB.refreshMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [retry]);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  const readings = useMemo(
    () => [
      ...(snapshot?.runner?.feeds.flood?.items ?? []),
      ...(snapshot?.runner?.feeds.rain?.items ?? []),
      ...(snapshot?.runner?.feeds.waterlevel?.items ?? []),
      ...(snapshot?.edge?.feeds.pm25?.items ?? []),
    ],
    [snapshot],
  );
  const zones = useZones(readings, initialArea, loadPickedArea);
  const focusZone = zones.selected ?? zones.path.at(-1) ?? null;
  // Location off: the area picked on the map stands in for the device position.
  const located = status === 'granted';
  const pickedZone = located ? null : focusZone;
  const location = useMemo(() => (pickedZone ? zoneCenter(pickedZone) : deviceLocation), [pickedZone, deviceLocation]);

  useEffect(() => {
    if (!zones.ready || status === 'pending') return;
    savePickedArea(located ? null : (focusZone?.properties.id ?? null));
  }, [zones.ready, status, located, focusZone?.properties.id]);

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
      // Stale readings are never shown as the local value.
      nearestPm: nearest(fresh(pm.filter((s) => s.value !== null)), location)[0] ?? null,
      floodPoints: flood,
      // A failed fetch must never read as "normal".
      floodAvailable: fresh(flood).length > 0,
      quakeAvailable: !!(snapshot?.edge?.feeds.quakesTmd?.items.length || snapshot?.edge?.feeds.quakesUsgs?.items.length),
      // Stale readings are only faded on the map, never counted.
      counts: floodCounts(fresh(flood)),
      nearestFlooded: nearest(fresh(flood).filter((p) => !p.offline && (p.severity === 'warn' || p.severity === 'danger')), location)[0] ?? null,
      cameras: cams,
      // Several cameras often share one junction name; list each junction once.
      nearCams: uniqueBy(nearest(cams, location, cams.length), (c) => c.name.th).slice(0, WEB.nearbyCameras),
      quakes: quakeSummary(snapshot, location, DEFAULT_CONFIG),
    };
  }, [snapshot, location, lang]);

  const focusId = (zones.selected ?? zones.path.at(-1))?.properties.id ?? null;

  // Keep ?area= in sync so the address bar URL is shareable.
  useEffect(() => {
    if (!zones.ready) return;
    const url = new URL(window.location.href);
    if (focusId) url.searchParams.set('area', focusId);
    else url.searchParams.delete('area');
    if (url.href !== window.location.href) window.history.replaceState(null, '', url);
    const focus = zones.selected ?? zones.path.at(-1) ?? null;
    document.title = focus ? t('share.metaTitle', lang, { area: zoneLabel(focus, lang), app: t('app.name', lang) }) : t('app.name', lang);
    // focusId captures every change of the selected/drilled zone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones.ready, focusId, lang]);

  const updatedAt = [snapshot?.edge?.updatedAt, snapshot?.runner?.updatedAt].filter(Boolean).sort().at(-1) ?? null;
  const alertArea = useMemo(() => {
    if (located) return zones.zonesAt(deviceLocation);
    const picked = [...zones.path, ...(zones.selected ? [zones.selected] : [])];
    return {
      district: picked.find((z) => z.properties.level === 2) ?? null,
      subdistrict: picked.find((z) => z.properties.level === 3) ?? null,
    };
  }, [located, deviceLocation, zones]);
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
  const radarIds = (snapshot?.runner?.feeds.radar?.items ?? []).map((f) => f.radarId);
  const radarId = radarChoice ?? radarFor(location, radarIds, WEB.map.defaultRadar);
  const radarFrame = snapshot?.runner?.feeds.radar?.items.find((f) => f.radarId === radarId) ?? null;
  const radarOld = !!radarFrame && loadedAt - new Date(radarFrame.time).getTime() > WEB.map.radarStaleMinutes * 60_000;
  const clock = (iso: string) =>
    new Date(iso).toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
  const summaryLines = useMemo(() => {
    const regionName = activeRegions()
      .map((r) => r.name[lang])
      .join(', ');
    const lines = [{ label: t('area.now', lang), area: regionName, summary: summarizeZone(readings, DEFAULT_CONFIG) }];
    const mine = located ? alertArea.district : pickedZone;
    if (mine) {
      const inside = groupByZone(readings, [mine]).get(mine.properties.id) ?? [];
      lines.unshift({
        label: t(located ? 'area.nearYou' : 'area.picked', lang),
        area: zoneLabel(mine, lang),
        summary: summarizeZone(inside, DEFAULT_CONFIG),
      });
    }
    return lines;
  }, [readings, located, alertArea, pickedZone, lang]);
  const toggle = (key: LayerKey) => setLayers((l) => ({ ...l, [key]: !l[key] }));

  return (
    <LoadStateContext.Provider value={snapshot ? 'ready' : loadState}>
      <a
        href="#summary"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[2000] focus:rounded-control focus:bg-surface focus:px-3 focus:py-2"
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
        {/* Same text as read-aloud, so screen-reader users get the whole picture in one place. */}
        <section id="summary" tabIndex={-1} aria-label={t('a11y.summary', lang)} className="sr-only">
          <h2>{t('a11y.summary', lang)}</h2>
          <p>{spoken}</p>
        </section>
        {loadState === 'error' && (
          <div role="alert" className="flex basis-full flex-wrap items-center gap-3 rounded-card border border-line-control bg-surface-sunken max-lg:order-first px-4 py-2.5 text-body text-ink">
            <span className="flex-1">{t('common.offline', lang)}</span>
            <button
              type="button"
              onClick={() => setRetry((n) => n + 1)}
              className="min-h-11 rounded-control border border-line-control bg-surface px-4 text-label hover:bg-surface-sunken"
            >
              {t('common.retry', lang)}
            </button>
          </div>
        )}
        {/* Only with data: without a snapshot it would wrongly read as "no sensors". */}
        {snapshot && <SummaryBanner lang={lang} lines={summaryLines} />}
        {(status === 'denied' || status === 'unsupported') && (
          <div className="flex basis-full flex-wrap items-center gap-2 rounded-card bg-surface-sunken px-4 py-2.5 text-body max-lg:order-first">
            <span className="flex flex-[1_1_260px] flex-col">
              {pickedZone ? (
                <strong className="text-title">{t('location.picked', lang, { area: zoneLabel(pickedZone, lang) })}</strong>
              ) : (
                <>
                  <span>{t('location.denied', lang)}</span>
                  <span className="text-caption text-ink-muted">{t('location.pickHint', lang)}</span>
                </>
              )}
            </span>
            <a
              href="#zones"
              className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${
                pickedZone ? 'border border-line-control bg-surface' : 'bg-accent text-on-accent'
              }`}
            >
              {t(pickedZone ? 'location.pickChange' : 'location.pick', lang)}
            </a>
            {status === 'denied' && (
              <button type="button" onClick={() => void locate()} className="min-h-11 rounded-full border border-line-control bg-surface px-4 font-medium">
                {t('location.useMine', lang)}
              </button>
            )}
          </div>
        )}

        <section aria-label={t('map.title', lang)} className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-card border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3.5 py-3">
            <strong className="mr-1.5 text-title">{t('map.layers', lang)}</strong>
            {(Object.keys(LAYER_LABEL) as LayerKey[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={layers[key]}
                onClick={() => toggle(key)}
                className={`min-h-11 rounded-full border px-3.5 text-body font-medium ${
                  layers[key] ? 'border-ink bg-ink text-on-ink' : 'border-line-control bg-surface text-ink'
                }`}
              >
                {t(LAYER_LABEL[key], lang)}
              </button>
            ))}
          </div>
          <MapView
            lang={lang}
            center={location}
            located={located}
            onLocate={locate}
            layers={layers}
            radarId={radarId}
            radarFocus={radarFocus}
            radarTime={radarFrame?.time ?? null}
            weather={weather}
            floodPoints={view.floodPoints}
            pmStations={view.pmStations}
            cameras={view.cameras}
            waterStations={view.waterStations}
            zones={zones}
            palette={palette}
            dark={prefs.dark}
          />
          {layers.radar && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-3.5 py-2.5 text-body">
              <label htmlFor="radar-src" className="text-ink-muted">
                {t('radar.source', lang)}
              </label>
              <select
                id="radar-src"
                value={radarId}
                onChange={(e) => {
                  setRadarChoice(e.target.value);
                  setRadarFocus((n) => n + 1);
                }}
                className="min-h-11 rounded-control border border-line-control bg-surface px-2.5 text-ink"
              >
                {radarGroups(radarIds, lang).map((g) => (
                  <optgroup key={g.agency} label={t(`radar.agency.${g.agency}`, lang)}>
                    {g.radars.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name[lang]}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <span className={radarOld ? 'rounded-control bg-surface-sunken px-2 py-0.5 text-caption text-ink' : 'text-caption text-ink-muted'}>
                {radarFrame
                  ? t(radarOld ? 'radar.old' : 'radar.frame', lang, { time: clock(radarFrame.time) })
                  : t('radar.none', lang)}
              </span>
              {radarFrame?.echoPixels !== undefined && radarFrame.echoPixels < WEB.map.radarMinEchoPixels && (
                <span className="rounded-control bg-surface-sunken px-2 py-0.5 text-caption text-ink-muted">{t('radar.clear', lang)}</span>
              )}
            </div>
          )}
          <div id="zones" className="scroll-mt-4">
            <ZonePanel lang={lang} zones={zones} />
          </div>
        </section>

        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-3.5 max-lg:order-first">
          <WeatherCard lang={lang} weather={weather} />
          <Pm25Card lang={lang} station={view.nearestPm} note={view.notes.pm25} />
          <FloodCard lang={lang} counts={view.counts} nearestFlooded={view.nearestFlooded} available={view.floodAvailable} note={view.notes.flood} />
          <QuakeCard lang={lang} alerts={view.quakes.alerts} latest={view.quakes.latestRegional} available={view.quakeAvailable} note={view.notes.quake} />
          <WaterLevelCard lang={lang} nearest={view.nearestWater} high={view.highWater} note={view.notes.water} />
          <AlertsCard lang={lang} district={alertArea.district} subdistrict={alertArea.subdistrict} />
        </aside>

        <div className="basis-full">
          <CctvList lang={lang} cameras={view.nearCams} />
        </div>
        {snapshot && (
          <div className="basis-full">
            <FeedStatus lang={lang} snapshot={snapshot} />
          </div>
        )}
      </main>
      <footer className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-4 px-4 pb-8 text-caption text-ink-muted sm:px-6">
        <span className="flex flex-[1_1_520px] flex-col gap-1">
          <span>{t('app.coverage', lang, { regions: activeRegions().map((r) => r.name[lang]).join(', ') })}</span>
          <SourceLinks lang={lang} />
          <span>{mapCredits[lang]}</span>
          <span>{t('sources.disclaimer', lang)}</span>
          <Link href={`/${lang}/privacy`} className="inline-flex min-h-11 items-center self-start text-accent underline underline-offset-4">
            {t('privacy.title', lang)}
          </Link>
        </span>
        <a
          href={WEB.donateUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center rounded-full bg-[#ffdd00] px-3.5 font-semibold text-[#0f1b2e]"
        >
          {t('footer.coffee', lang)}
        </a>
      </footer>
    </LoadStateContext.Provider>
  );
}
