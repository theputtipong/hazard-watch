'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { activeRegions, DEFAULT_CONFIG, isStale, type DashboardSnapshot, type WeatherNow } from '@hw/core';
import { t, type Lang, type MessageKey } from '@hw/core/i18n';
import { WEB } from '@/config';
import { fetchSnapshot, fetchWeather } from '@/lib/api';
import { floodCounts, nearest, quakeSummary, uniqueBy } from '@/lib/derive';
import { feedFreshness, freshnessNote } from '@/lib/freshness';
import { useLocation } from '@/lib/useLocation';
import { useZones } from '@/lib/useZones';
import { ZonePanel } from './ZonePanel';
import { CctvList } from './CctvList';
import { FloodCard, Pm25Card, QuakeCard, WaterLevelCard, WeatherCard } from './HazardCards';
import { Header } from './Header';
import { RADAR_BOUNDS, type LayerKey, type Layers } from '@/lib/layers';

const MapView = dynamic(() => import('./MapView'), { ssr: false, loading: () => <div className="h-[420px] bg-[#eaf0f5] sm:h-[520px]" /> });

const LAYER_LABEL: Record<LayerKey, MessageKey> = { zones: 'zone.layer', radar: 'layer.radar', flood: 'layer.flood', water: 'layer.water', pm25: 'layer.pm25', cctv: 'layer.cctv' };

export function Dashboard({ lang }: { lang: Lang }) {
  const { location, status, locate } = useLocation();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [layers, setLayers] = useState<Layers>({ ...WEB.map.defaultLayers });
  const [radarId] = useState<string>(WEB.map.defaultRadar);

  useEffect(() => {
    let alive = true;
    const load = () => fetchSnapshot().then((s) => alive && setSnapshot(s)).catch(() => {});
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
  const toggle = (key: LayerKey) => setLayers((l) => ({ ...l, [key]: !l[key] }));

  return (
    <>
      <Header lang={lang} updatedAt={updatedAt} />
      <main className="mx-auto flex max-w-[1360px] flex-wrap items-start gap-5 px-4 py-5 sm:px-6">
        {status === 'denied' && <p className="basis-full rounded-xl bg-watch px-4 py-2 text-sm text-watch-strong">{t('location.denied', lang)}</p>}

        <section aria-label={t('map.title', lang)} className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-2xl border border-line bg-panel">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#e6eaf0] px-3.5 py-3">
            <strong className="mr-1.5 text-[15px]">{t('map.layers', lang)}</strong>
            {(Object.keys(LAYER_LABEL) as LayerKey[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={layers[key]}
                onClick={() => toggle(key)}
                className={`min-h-10 rounded-full border px-3.5 text-sm font-medium ${
                  layers[key] ? 'border-ink bg-ink text-white' : 'border-[#c9d1db] bg-panel text-ink-2'
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
            floodPoints={view.floodPoints}
            pmStations={view.pmStations}
            cameras={view.cameras}
            waterStations={view.waterStations}
            zones={zones}
          />
          {layers.radar && !RADAR_BOUNDS[radarId] && <p className="px-3.5 py-2 text-xs text-muted">{t('radar.notCalibrated', lang)}</p>}
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
          className="inline-flex min-h-10 items-center rounded-full bg-[#ffdd00] px-3.5 font-semibold text-ink"
        >
          {t('footer.coffee', lang)}
        </a>
      </footer>
    </>
  );
}
