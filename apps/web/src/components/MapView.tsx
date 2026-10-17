'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleMarker, GeoJSON, ImageOverlay, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents, WMSTileLayer } from 'react-leaflet';
import {
  DEFAULT_CONFIG,
  DEFAULT_VIEW,
  isStale,
  NASA_ATTRIBUTION,
  NASA_LAYERS,
  RADARS,
  regionFor,
  zoneCenter,
  type CctvCamera,
  type FireHotspot,
  type LatLng,
  type NasaEvent,
  type NasaLayerId,
  type Observation,
  type Severity,
  type SourceResult,
  type WeatherNow,
  type ZoneFeature,
} from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';
import { WEB } from '@/config';
import { radarImageUrl } from '@/lib/api';
import type { Layers } from '@/lib/layers';
import { openCamera, safeCameraUrl } from '@/lib/openCamera';
import type { MapPalette } from '@/lib/prefs';
import type { ZoneView } from '@/lib/useZones';
import { RadarDrift } from './Wind';
import { cctvIcon, eventIcon, floodIcon, LEGEND_GLYPH, pm25Icon, waterIcon, youIcon } from './mapIcons';
import { gibsDataDate, NASA_RASTER_IDS, rampGradient, toLeaflet, useNasaLayers, type NasaLayerState } from '@/lib/nasaLayers';
import { zoneLabel } from '@/lib/zoneText';
import type { VectorBaseMap } from '@/lib/vectorBaseMap';

interface Props {
  lang: Lang;
  center: LatLng;
  located: boolean;
  onLocate: () => Promise<LatLng | null>;
  layers: Layers;
  radarId: string;
  radarTime: string | null;
  /** Bumped on each radar pick so the map flies to it. */
  radarFocus: number;
  weather: WeatherNow | null;
  floodPoints: Observation[];
  pmStations: Observation[];
  cameras: CctvCamera[];
  waterStations: Observation[];
  zones: ZoneView;
  palette: MapPalette;
  dark: boolean;
  /** runner.feeds.fires from /v1/snapshot (FIRMS hotspots). Optional so the map works before the feed exists. */
  fires?: SourceResult<FireHotspot> | null;
  /** runner.feeds.events from /v1/snapshot (open NASA EONET events). */
  events?: SourceResult<NasaEvent> | null;
}

const Z = { event: 50, cctv: 100, pm25: 200, water: 250, flood: 300, you: 1000 } as const;
const FLOOD_RANK: Record<Severity, number> = { ok: 0, watch: 1, warn: 2, danger: 3 };
const fade = (o: Observation) => (isStale(o.observedAt, DEFAULT_CONFIG) ? WEB.map.staleOpacity : 1);

/** Lets the map be dragged sideways forever (worldCopyJump) but not past the poles into grey. */
const WORLD_BOUNDS: L.LatLngBoundsExpression = [
  [-85.05, -100_000],
  [85.05, 100_000],
];

export default function MapView({ lang, center, located, onLocate, layers, radarId, radarTime, radarFocus, weather, floodPoints, pmStations, cameras, waterStations, zones, palette, dark, fires, events }: Props) {
  const bounds = RADARS[radarId]?.bounds;
  // First view: GPS fix, else the picked area, else Bangkok. Never the country centre (regionFor(null)).
  const [start] = useState(() => startView(center, located, zones.selected ?? zones.path.at(-1) ?? null));
  const [zoom, setZoom] = useState(start.zoom);
  const [map, setMap] = useState<L.Map | null>(null);
  const [nasa, setNasa] = useNasaLayers();
  const showCams = layers.cctv && zoom >= WEB.map.cctvMinZoom;
  const online = floodPoints.filter((p) => !p.offline);
  const normal = online.filter((p) => p.severity === 'ok');
  const problems = online.filter((p) => p.severity !== 'ok').sort((a, b) => FLOOD_RANK[a.severity] - FLOOD_RANK[b.severity]);

  return (
    <div className="relative">
      <MapContainer
        ref={setMap}
        {...(start.bounds ? { bounds: start.bounds, boundsOptions: { padding: [WEB.zones.fitPadding, WEB.zones.fitPadding] } } : { center: [start.center.lat, start.center.lng], zoom: start.zoom })}
        minZoom={WEB.map.worldMinZoom}
        maxZoom={WEB.map[WEB.map.tileProvider].maxZoom}
        worldCopyJump
        maxBounds={WORLD_BOUNDS}
        maxBoundsViscosity={1}
        scrollWheelZoom
        className="h-[420px] w-full sm:h-[520px]"
      >
        <BaseTiles dark={dark} lang={lang} />
        {nasa.raster && <GibsLayer id={nasa.raster} />}
        <ZoomWatcher onZoom={setZoom} />
        <FollowFirstFix center={center} located={located} />
        <FlyToRadar radarId={radarId} focus={radarFocus} />
        <FitToFocus focus={zones.selected ?? zones.path.at(-1) ?? null} depth={zones.path.length} center={center} />
        {layers.zones && <ZoneLayer lang={lang} zones={zones} palette={palette} />}
        {layers.radar && bounds && <ImageOverlay key={`${radarId}:${radarTime}`} url={radarImageUrl(radarId, radarTime ?? undefined)} bounds={bounds} opacity={WEB.map.radarOpacity} />}
        {nasa.events && <EventLayer lang={lang} items={events?.items ?? []} />}
        {nasa.firms && <FireLayer lang={lang} items={fires?.items ?? []} zoom={zoom} />}
        {nasa.firms && <Credit text={NASA_ATTRIBUTION.firms} />}
        {nasa.events && <Credit text={NASA_ATTRIBUTION.eonet} />}

        {showCams &&
          cameras.map((c) => (
            <Marker key={c.id} position={[c.location.lat, c.location.lng]} icon={cctvIcon()} zIndexOffset={Z.cctv}>
              <Popup>
                <PopupBody title={c.name[lang]}>
                  <a
                    href={safeCameraUrl(c.viewUrl) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold"
                    onClick={(e) => {
                      e.preventDefault();
                      openCamera(c);
                    }}
                  >
                    {t('cctv.viewLive', lang)} ↗
                  </a>
                  <span className="text-caption text-ink-muted">{t('cctv.opening', lang)}</span>
                </PopupBody>
              </Popup>
            </Marker>
          ))}

        {layers.pm25 &&
          pmStations
            .filter((s) => s.value !== null)
            .map((s) => (
              <Marker key={s.id} position={[s.location.lat, s.location.lng]} icon={pm25Icon(s.value!, s.severity, palette.severity)} zIndexOffset={Z.pm25} opacity={fade(s)}>
                <Popup>
                  <PopupBody title={s.name[lang]}>
                    <span>
                      PM2.5 <b>{s.value}</b> {s.unit} · {t(`severity.${s.severity}`, lang)}
                    </span>
                    <TimeLine lang={lang} iso={s.observedAt} />
                  </PopupBody>
                </Popup>
              </Marker>
            ))}

        {layers.water &&
          waterStations
            .filter((w) => w.value !== null)
            .map((w) => (
              <Marker key={w.id} position={[w.location.lat, w.location.lng]} icon={waterIcon(w.value!, w.severity, palette.severity)} zIndexOffset={Z.water} opacity={fade(w)}>
                <Popup>
                  <PopupBody title={w.name[lang]}>
                    <span>
                      <b>
                        {Math.round(w.value!)}
                        {w.unit}
                      </b>{' '}
                      {t('water.ofBank', lang)} · {t(`severity.${w.severity}`, lang)}
                    </span>
                    <TimeLine lang={lang} iso={w.observedAt} />
                  </PopupBody>
                </Popup>
              </Marker>
            ))}

        {layers.flood &&
          normal.map((p) => (
            <CircleMarker
              key={p.id}
              center={[p.location.lat, p.location.lng]}
              radius={WEB.map.markerRadius.floodNormal}
              pathOptions={{ color: '#fff', weight: 1.5, fillColor: WEB.floodNormalColor, fillOpacity: 1 }}
            >
              <Popup>
                <PopupBody title={p.name[lang]}>
                  <span>{t('flood.normal', lang)}</span>
                  <TimeLine lang={lang} iso={p.observedAt} />
                </PopupBody>
              </Popup>
            </CircleMarker>
          ))}
        {layers.flood &&
          problems.map((p) => (
            <Marker
              key={p.id}
              position={[p.location.lat, p.location.lng]}
              icon={floodIcon(p.severity as Exclude<Severity, 'ok'>, palette.severity)}
              zIndexOffset={Z.flood + FLOOD_RANK[p.severity]}
              opacity={fade(p)}
            >
              <Popup>
                <PopupBody title={p.name[lang]}>
                  <span>
                    <b>{t(`severity.${p.severity}`, lang)}</b>
                    {p.value !== null && ` · ${t('popup.depth', lang)} ${p.value} ${p.unit}`}
                  </span>
                  <TimeLine lang={lang} iso={p.observedAt} />
                </PopupBody>
              </Popup>
            </Marker>
          ))}

        {/* A hand-picked area or the default centre is not "you". */}
        {located && (
          <Marker position={[center.lat, center.lng]} icon={youIcon()} zIndexOffset={Z.you}>
            <Popup>{t('map.you', lang)}</Popup>
          </Marker>
        )}
      </MapContainer>
      {map && <MapButtons map={map} lang={lang} center={center} located={located} onLocate={onLocate} />}
      <Legend lang={lang} layers={layers} palette={palette} nasa={nasa} />
      <NasaControl lang={lang} nasa={nasa} onChange={setNasa} fires={fires ?? null} events={events ?? null} />
      {layers.radar && <RadarDrift lang={lang} weather={weather} />}
      {layers.cctv && !showCams && (
        <p className="pointer-events-none absolute bottom-6 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-ink/85 px-3 py-1 text-caption text-on-ink">
          {t('map.zoomForCctv', lang)}
        </p>
      )}
    </div>
  );
}

/** MapLibre needs WebGL; without it (old phones, some privacy settings) the raster OSM map is used instead. */
function hasWebGl(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

function BaseTiles({ dark, lang }: { dark: boolean; lang: Lang }) {
  const [vectorFailed, setVectorFailed] = useState(false);
  const [webGl] = useState(hasWebGl);
  if (WEB.map.tileProvider === 'openfreemap' && webGl && !vectorFailed) {
    return <VectorTiles dark={dark} lang={lang} onFail={() => setVectorFailed(true)} />;
  }
  const src = WEB.map.osm;
  return (
    <TileLayer
      url={src.url}
      attribution={src.attribution}
      maxZoom={src.maxZoom}
      className={src.invertInDark ? 'hw-tiles-invert' : undefined}
    />
  );
}

/** MapLibre is large and browser-only, so it is imported on demand. */
function VectorTiles({ dark, lang, onFail }: { dark: boolean; lang: Lang; onFail: () => void }) {
  const map = useMap();
  const [base, setBase] = useState<VectorBaseMap | null>(null);
  const initial = useRef({ dark, lang, onFail });
  useEffect(() => {
    let cancelled = false;
    let made: VectorBaseMap | null = null;
    import('@/lib/vectorBaseMap').then(({ createVectorBaseMap }) => {
      if (cancelled) return;
      made = createVectorBaseMap(initial.current.dark, initial.current.lang, initial.current.onFail);
      made.layer.addTo(map);
      setBase(made);
    }).catch((e) => {
      console.error('Base map failed to load', e);
      initial.current.onFail();
    });
    return () => {
      cancelled = true;
      made?.layer.remove();
    };
  }, [map]);
  useEffect(() => base?.setTheme(dark), [base, dark]);
  useEffect(() => base?.setLang(lang), [base, lang]);
  return null;
}

function ZoneLayer({ lang, zones, palette }: { lang: Lang; zones: ZoneView; palette: MapPalette }) {
  const z = WEB.zones;
  return (
    <>
      {zones.visible.map((zone: ZoneFeature) => {
        const id = zone.properties.id;
        const sev = zones.summaries.get(id)?.severity ?? null;
        const selected = zones.selected?.properties.id === id;
        return (
          <GeoJSON
            // Style isn't reactive in react-leaflet, so the key changes with what affects the style.
            key={`${id}:${sev}:${selected}:${palette.selected}:${sev ? palette.severity[sev] : ''}`}
            data={zone as unknown as GeoJSON.Feature}
            style={{
              color: selected ? palette.selected : z.borderColor,
              weight: selected ? z.selectedWeight : z.borderWeight,
              fillColor: sev ? palette.severity[sev] : 'transparent',
              fillOpacity: sev ? z.fillOpacity[sev] : 0,
            }}
            eventHandlers={{ click: () => zones.open(id) }}
          >
            <Tooltip sticky>{zoneLabel(zone, lang)}</Tooltip>
          </GeoJSON>
        );
      })}
    </>
  );
}

function FlyToRadar({ radarId, focus }: { radarId: string; focus: number }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const r = RADARS[radarId];
    if (r) map.flyToBounds(r.bounds, { padding: [WEB.zones.fitPadding, WEB.zones.fitPadding] });
    // Only a new pick (focus) should move the map, not the radar id changing on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  return null;
}

function FitToFocus({ focus, depth, center }: { focus: ZoneFeature | null; depth: number; center: LatLng }) {
  const map = useMap();
  const last = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const key = focus?.properties.id ?? null;
    if (last.current === undefined) {
      last.current = key;
      return;
    }
    if (last.current === key) return;
    last.current = key;
    const [minLng, minLat, maxLng, maxLat] = focus ? focus.properties.bbox : (() => {
      const b = regionFor(center).bbox;
      return [b.minLng, b.minLat, b.maxLng, b.maxLat];
    })();
    map.flyToBounds(
      [
        [minLat, minLng],
        [maxLat, maxLng],
      ],
      { padding: [WEB.zones.fitPadding, WEB.zones.fitPadding] },
    );
  }, [focus, depth, center, map]);
  return null;
}

function ZoomWatcher({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  // Starting from bounds picks the zoom without a zoomend.
  useEffect(() => onZoom(map.getZoom()), [map, onZoom]);
  return null;
}

function FollowFirstFix({ center, located }: { center: LatLng; located: boolean }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (located && !done.current) {
      done.current = true;
      map.setView([center.lat, center.lng], Math.max(map.getZoom(), WEB.map.locateZoom - 1));
    }
  }, [located, center, map]);
  return null;
}

/** Kept outside the Leaflet container so React click handlers work. */
function MapButtons({
  map,
  lang,
  center,
  located,
  onLocate,
}: {
  map: L.Map;
  lang: Lang;
  center: LatLng;
  located: boolean;
  onLocate: () => Promise<LatLng | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const goToMe = async () => {
    setHint(null);
    if (located) {
      map.flyTo([center.lat, center.lng], WEB.map.locateZoom);
      return;
    }
    setBusy(true);
    const pos = await onLocate();
    setBusy(false);
    if (pos) map.flyTo([pos.lat, pos.lng], WEB.map.locateZoom);
    else setHint(t('map.locationOff', lang));
  };

  const fitRegion = () => {
    const b = regionFor(center).bbox;
    map.flyToBounds([
      [b.minLat, b.minLng],
      [b.maxLat, b.maxLng],
    ]);
  };

  const btn =
    'grid size-11 place-items-center rounded-control border border-line bg-surface text-ink shadow-sm hover:bg-bg disabled:opacity-60';
  return (
    // Higher on phones, where the map credits wrap onto two lines.
    <div className="absolute bottom-12 left-2.5 z-[1000] sm:bottom-8 flex flex-col items-start gap-2">
      {hint && <p className="max-w-[220px] rounded-control bg-ink/90 px-2.5 py-1.5 text-caption text-on-ink">{hint}</p>}
      <button type="button" className={btn} onClick={goToMe} disabled={busy} aria-label={busy ? t('map.locating', lang) : t('map.locate', lang)} title={t('map.locate', lang)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={WEB.map.youColor} strokeWidth="2" aria-hidden="true" className={busy ? 'animate-pulse' : ''}>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.5" fill={WEB.map.youColor} />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      </button>
      <button type="button" className={btn} onClick={fitRegion} aria-label={t('map.fitRegion', lang)} title={t('map.fitRegion', lang)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      </button>
    </div>
  );
}

function PopupBody({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-[160px] flex-col gap-1 font-sans text-body leading-snug">
      <strong className="text-body">{title}</strong>
      {children}
    </div>
  );
}

function TimeLine({ lang, iso }: { lang: Lang; iso: string }) {
  const time = new Date(iso).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  });
  return (
    <span className="text-caption text-ink-muted">
      {t('popup.time', lang)} {time}
    </span>
  );
}

/** Tiny legend symbols. Their 7–8px labels are part of the icon artwork, the only sizes outside the type scale. */
function Glyph({ bg, paths, size = 18, children }: { bg: string; paths?: string; size?: number; children?: ReactNode }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full border-2 border-white shadow-sm"
      style={{ width: size, height: size, background: bg }}
      aria-hidden="true"
    >
      {paths ? <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: paths }} /> : children}
    </span>
  );
}

function Legend({ lang, layers, palette, nasa }: { lang: Lang; layers: Layers; palette: MapPalette; nasa: NasaLayerState }) {
  const [open, setOpen] = useState(() => window.innerWidth >= WEB.map.legendOpenMinWidth);
  const c = palette.severity;
  const row = 'flex items-center gap-2';
  return (
    <div className="absolute top-3 right-3 z-[1000] flex max-w-[210px] flex-col gap-1.5 rounded-card border border-line bg-surface/95 px-3 py-2 text-caption text-ink shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 items-center justify-between gap-3 text-body font-semibold text-ink"
      >
        {t('map.legend', lang)}
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        <span className="sr-only">{open ? t('map.hideLegend', lang) : t('map.showLegend', lang)}</span>
      </button>
      {open && (
        <>
          <span className={row}>
            <Glyph bg={WEB.map.youColor} paths={LEGEND_GLYPH.person} />
            {t('map.you', lang)}
          </span>
          {layers.flood && (
            <>
              <span className={row}>
                <Glyph bg={c.danger} paths={LEGEND_GLYPH.drop} />
                {t('flood.deep', lang)}
              </span>
              <span className={row}>
                <Glyph bg={c.warn} paths={LEGEND_GLYPH.drop} />
                {t('flood.flooded', lang)}
              </span>
              <span className={row}>
                <Glyph bg={c.watch} paths={LEGEND_GLYPH.drop} />
                {t('flood.minor', lang)}
              </span>
              <span className={row}>
                <span className="mx-[5px] size-2 rounded-full" style={{ background: WEB.floodNormalColor }} aria-hidden="true" />
                {t('flood.normal', lang)}
              </span>
            </>
          )}
          {layers.water && (
            <span className={row}>
              <span
                className="grid size-[18px] shrink-0 place-items-center rounded-tiny border-2 border-white text-[7px] font-bold text-white shadow-sm"
                style={{ background: c.watch }}
                aria-hidden="true"
              >
                %
              </span>
              {t('layer.water', lang)}
            </span>
          )}
          {layers.pm25 && (
            <span className={row}>
              <Glyph bg={c.watch}>
                <span className="text-[8px] font-bold text-white">22</span>
              </Glyph>
              {t('layer.pm25', lang)}
            </span>
          )}
          {layers.cctv && (
            <span className={row}>
              <Glyph bg={WEB.map.cctvColor} paths={LEGEND_GLYPH.camera} />
              {t('layer.cctv', lang)}
            </span>
          )}
          {nasa.firms && (
            <span className={row}>
              <Glyph bg={WEB.map.fireColor} paths={LEGEND_GLYPH.flame} />
              {t('layer.nasa.firms', lang)}
            </span>
          )}
          {nasa.events && (
            <span className={row}>
              <Glyph bg={WEB.map.eventColor} paths={LEGEND_GLYPH.storm} />
              {t('layer.nasa.events', lang)}
            </span>
          )}
          {nasa.raster && <NasaRasterLegend lang={lang} id={nasa.raster} />}
        </>
      )}
    </div>
  );
}

/**
 * What the active GIBS raster's colours mean, from the official colormap. Every colour has a text label next to or
 * under it, and a ramp is also read out as one sentence, so nothing depends on seeing the colour.
 */
function NasaRasterLegend({ lang, id }: { lang: Lang; id: NasaLayerId }) {
  const legend = NASA_LAYERS[id].legend;
  if (!legend) return null;
  const title = t(`layer.nasa.${id}`, lang);
  const labels = legend.stops.map((s) => t(s.labelKey, lang));
  const mid = Math.floor((labels.length - 1) / 2);
  return (
    <div role="group" aria-label={title} className="mt-1 flex flex-col gap-1.5 border-t border-line pt-1.5">
      <span className="font-semibold">{title}</span>
      {legend.kind === 'classes' ? (
        <ul className="flex flex-col gap-1">
          {legend.stops.map((s, i) => (
            <li key={s.labelKey} className="flex items-center gap-2">
              <span className="size-3.5 shrink-0 rounded-tiny border border-line" style={{ background: s.color }} aria-hidden="true" />
              {labels[i]}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <span className="h-3 w-full rounded-tiny border border-line" style={{ background: rampGradient(legend) }} aria-hidden="true" />
          <span className="flex justify-between gap-1 text-ink-muted" aria-hidden="true">
            <span>{labels[0]}</span>
            <span>{labels[mid]}</span>
            <span className="text-right">{labels[labels.length - 1]}</span>
          </span>
          <span className="sr-only">{labels.join(', ')}</span>
        </>
      )}
      <span className="text-ink-muted">{t(legend.noteKey, lang)}</span>
    </div>
  );
}

function startView(center: LatLng, located: boolean, focus: ZoneFeature | null): { center: LatLng; zoom: number; bounds?: L.LatLngBoundsExpression } {
  if (located) return { center, zoom: WEB.map.locateZoom - 1 };
  if (focus) {
    const [minLng, minLat, maxLng, maxLat] = focus.properties.bbox;
    return {
      center: zoneCenter(focus),
      zoom: DEFAULT_VIEW.zoom,
      bounds: [
        [minLat, minLng],
        [maxLat, maxLng],
      ],
    };
  }
  return DEFAULT_VIEW;
}

/** UTC day, so a layer's TIME (and its tile URLs) changes once a day, not on every render. */
const utcDay = () => new Date().toISOString().slice(0, 10);

/** One GIBS raster. Above the base map (zIndex) and under zones/radar/pins, which live in the overlay pane. */
function GibsLayer({ id }: { id: NasaLayerId }) {
  const day = utcDay();
  const g = useMemo(() => toLeaflet(NASA_LAYERS[id], new Date(`${day}T12:00:00Z`)), [id, day]);
  if (g.kind === 'wms' && g.params) {
    // Leaflet copies unknown options (time) into the query string; WMSParams just doesn't declare it.
    return <WMSTileLayer key={`${id}:${day}`} url={g.url} params={g.params as L.WMSParams} {...g.options} zIndex={5} />;
  }
  return <TileLayer key={`${id}:${day}`} url={g.url} {...g.options} zIndex={5} />;
}

/** Adds a credit line to the map while a point layer (which has no attribution option of its own) is shown. */
function Credit({ text }: { text: string }) {
  const map = useMap();
  useEffect(() => {
    const ctl = map.attributionControl;
    ctl?.addAttribution(text);
    return () => {
      ctl?.removeAttribution(text);
    };
  }, [map, text]);
  return null;
}

/**
 * FIRMS hotspots: up to a few thousand in burning season, so they are canvas dots with one shared popup
 * instead of a DOM marker and popup each.
 */
function FireLayer({ lang, items, zoom }: { lang: Lang; items: FireHotspot[]; zoom: number }) {
  const renderer = useMemo(() => L.canvas({ padding: 0.5 }), []);
  const [picked, setPicked] = useState<FireHotspot | null>(null);
  const full = zoom >= WEB.map.firmsMinZoom;
  const radius = full ? WEB.map.firmsRadius.full : WEB.map.firmsRadius.small;
  return (
    <>
      {items.map((f) => (
        <CircleMarker
          key={f.id}
          center={[f.location.lat, f.location.lng]}
          radius={radius}
          renderer={renderer}
          pathOptions={{ color: '#fff', weight: full ? 1 : 0.5, fillColor: WEB.map.fireColor, fillOpacity: 0.9 }}
          eventHandlers={{ click: () => setPicked(f) }}
        />
      ))}
      {picked && (
        <Popup position={[picked.location.lat, picked.location.lng]} eventHandlers={{ remove: () => setPicked(null) }}>
          <PopupBody title={t('layer.nasa.firms', lang)}>
            {picked.frp !== null && <span>FRP {Math.round(picked.frp)} MW · {picked.satellite}</span>}
            <TimeLine lang={lang} iso={picked.detectedAt} />
            <span className="text-caption text-ink-muted">{NASA_ATTRIBUTION.firms}</span>
          </PopupBody>
        </Popup>
      )}
    </>
  );
}

/** Open EONET events; storms also get their recent track as a dashed line. */
function EventLayer({ lang, items }: { lang: Lang; items: NasaEvent[] }) {
  return (
    <>
      {items.map((e) => {
        const track = [...e.track].sort((a, b) => a.at.localeCompare(b.at)).map((p) => [p.location.lat, p.location.lng] as [number, number]);
        const wind = [...e.track].sort((a, b) => b.at.localeCompare(a.at))[0]?.windKts ?? null;
        return (
          <Fragment key={e.id}>
            {track.length > 1 && (
              <Polyline positions={track} pathOptions={{ color: WEB.map.eventColor, weight: 2, opacity: 0.7, dashArray: '6 6' }} interactive={false} />
            )}
            <Marker position={[e.location.lat, e.location.lng]} icon={eventIcon(e.category)} zIndexOffset={Z.event}>
              <Popup>
                <PopupBody title={`${t(`nasa.event.${e.category}`, lang)}: ${e.title}`}>
                  {wind !== null && <span>{wind} kt</span>}
                  <TimeLine lang={lang} iso={e.updatedAt} />
                  {e.url && (
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="font-semibold">
                      NASA EONET ↗
                    </a>
                  )}
                </PopupBody>
              </Popup>
            </Marker>
          </Fragment>
        );
      })}
    </>
  );
}

const fmtDay = (lang: Lang, iso: string) =>
  new Date(iso).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtTime = (lang: Lang, iso: string) =>
  new Date(iso).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

/** Newest item time, falling back to when the runner fetched the feed. */
function feedTime<T>(feed: SourceResult<T> | null, at: (item: T) => string): string | null {
  if (!feed) return null;
  let best: string | null = null;
  for (const item of feed.items) {
    const v = at(item);
    if (!best || v > best) best = v;
  }
  return best ?? feed.fetchedAt;
}

/**
 * NASA layers sit on the map rather than in the layer chips above it, so this file owns them end to end.
 * Each active layer shows the day its data is from and its credit line.
 */
function NasaControl({
  lang,
  nasa,
  onChange,
  fires,
  events,
}: {
  lang: Lang;
  nasa: NasaLayerState;
  onChange: (change: (s: NasaLayerState) => NasaLayerState) => void;
  fires: SourceResult<FireHotspot> | null;
  events: SourceResult<NasaEvent> | null;
}) {
  const [open, setOpen] = useState(false);
  const anyOn = nasa.firms || nasa.events || nasa.raster !== null;
  const firesAt = feedTime(fires, (f) => f.detectedAt);
  const eventsAt = feedTime(events, (e) => e.updatedAt);
  const item = (on: boolean) =>
    `flex min-h-11 w-full items-center gap-2 rounded-control border px-2.5 text-left text-body ${
      on ? 'border-ink bg-ink text-on-ink' : 'border-line-control bg-surface text-ink'
    }`;
  const note = 'px-1 pb-1 text-caption text-ink-muted';
  return (
    <div className="absolute top-[88px] left-2.5 z-[1000] flex max-h-[calc(100%-180px)] max-w-[240px] flex-col gap-1.5 overflow-y-auto rounded-card border border-line bg-surface/95 p-1.5 text-caption text-ink shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 items-center justify-between gap-2 px-1.5 text-body font-semibold text-ink"
      >
        <span className="flex items-center gap-1.5">
          NASA
          {anyOn && <span className="size-2 rounded-full bg-accent" aria-hidden="true" />}
        </span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <>
          <button type="button" aria-pressed={nasa.firms} className={item(nasa.firms)} onClick={() => onChange((s) => ({ ...s, firms: !s.firms }))}>
            {t('layer.nasa.firms', lang)}
          </button>
          {nasa.firms && (
            <span className={note}>
              {firesAt && <>{fmtTime(lang, firesAt)} · </>}
              {NASA_ATTRIBUTION.firms}
            </span>
          )}
          <button type="button" aria-pressed={nasa.events} className={item(nasa.events)} onClick={() => onChange((s) => ({ ...s, events: !s.events }))}>
            {t('layer.nasa.events', lang)}
          </button>
          {nasa.events && (
            <span className={note}>
              {eventsAt && <>{fmtTime(lang, eventsAt)} · </>}
              {NASA_ATTRIBUTION.eonet}
            </span>
          )}
          <span className="mt-1 border-t border-line" aria-hidden="true" />
          {NASA_RASTER_IDS.map((id) => {
            const on = nasa.raster === id;
            const d = on ? gibsDataDate(NASA_LAYERS[id]) : null;
            return (
              <span key={id} className="flex flex-col gap-1">
                {/* One raster at a time; tapping the active one turns it off. */}
                <button type="button" aria-pressed={on} className={item(on)} onClick={() => onChange((s) => ({ ...s, raster: s.raster === id ? null : id }))}>
                  {t(`layer.nasa.${id}`, lang)}
                </button>
                {d && (
                  <span className={note}>
                    {t('nasa.dataDate', lang, { date: `${d.approx ? '≈ ' : ''}${fmtDay(lang, `${d.date}T00:00:00Z`)}` })} · {NASA_LAYERS[id].attribution}
                  </span>
                )}
              </span>
            );
          })}
          {anyOn && <span className={note}>{t('nasa.disclaimer', lang)}</span>}
        </>
      )}
    </div>
  );
}
