'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleMarker, GeoJSON, ImageOverlay, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { DEFAULT_CONFIG, isStale, RADARS, regionFor, type CctvCamera, type LatLng, type Observation, type Severity, type ZoneFeature } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';
import { WEB } from '@/config';
import { radarImageUrl } from '@/lib/api';
import type { Layers } from '@/lib/layers';
import type { MapPalette } from '@/lib/prefs';
import type { ZoneView } from '@/lib/useZones';
import { cctvIcon, floodIcon, LEGEND_GLYPH, pm25Icon, waterIcon, youIcon } from './mapIcons';
import { zoneLabel } from './ZonePanel';

interface Props {
  lang: Lang;
  center: LatLng;
  /** True once the browser gave a real position (not the region fallback). */
  located: boolean;
  onLocate: () => Promise<LatLng | null>;
  layers: Layers;
  radarId: string;
  /** Time of the radar frame (cache key for the image). */
  radarTime: string | null;
  floodPoints: Observation[];
  pmStations: Observation[];
  cameras: CctvCamera[];
  waterStations: Observation[];
  zones: ZoneView;
  /** Severity colours for the current theme / colour-blind setting. */
  palette: MapPalette;
}

/** Draw order: problems above normal points, and "you" above everything. */
const Z = { cctv: 100, pm25: 200, water: 250, flood: 300, you: 1000 } as const;
const FLOOD_RANK: Record<Severity, number> = { ok: 0, watch: 1, warn: 2, danger: 3 };
/** Readings older than `staleAfterMinutes` are drawn faded so they don't read as current. */
const fade = (o: Observation) => (isStale(o.observedAt, DEFAULT_CONFIG) ? WEB.map.staleOpacity : 1);

export default function MapView({ lang, center, located, onLocate, layers, radarId, radarTime, floodPoints, pmStations, cameras, waterStations, zones, palette }: Props) {
  const bounds = RADARS[radarId]?.bounds;
  const startZoom = regionFor(center).zoom;
  const [zoom, setZoom] = useState(startZoom);
  const [map, setMap] = useState<L.Map | null>(null);
  const showCams = layers.cctv && zoom >= WEB.map.cctvMinZoom;
  const online = floodPoints.filter((p) => !p.offline);
  const normal = online.filter((p) => p.severity === 'ok');
  const problems = online.filter((p) => p.severity !== 'ok').sort((a, b) => FLOOD_RANK[a.severity] - FLOOD_RANK[b.severity]);

  return (
    <div className="relative">
      <MapContainer ref={setMap} center={[center.lat, center.lng]} zoom={startZoom} scrollWheelZoom className="h-[420px] w-full sm:h-[520px]">
        <TileLayer attribution={WEB.map.attribution} url={WEB.map.tileUrl} />
        <ZoomWatcher onZoom={setZoom} />
        <FollowFirstFix center={center} located={located} />
        <FitToFocus focus={zones.selected ?? zones.path.at(-1) ?? null} depth={zones.path.length} center={center} />
        {layers.zones && <ZoneLayer lang={lang} zones={zones} palette={palette} />}
        {layers.radar && bounds && <ImageOverlay key={`${radarId}:${radarTime}`} url={radarImageUrl(radarId, radarTime ?? undefined)} bounds={bounds} opacity={WEB.map.radarOpacity} />}

        {showCams &&
          cameras.map((c) => (
            <Marker key={c.id} position={[c.location.lat, c.location.lng]} icon={cctvIcon()} zIndexOffset={Z.cctv}>
              <Popup>
                <PopupBody title={c.name[lang]}>
                  <a href={c.viewUrl} target="_blank" rel="noopener noreferrer" className="font-semibold">
                    {t('common.viewAtSource', lang)} ↗
                  </a>
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

        <Marker position={[center.lat, center.lng]} icon={youIcon()} zIndexOffset={Z.you}>
          <Popup>{t('map.you', lang)}</Popup>
        </Marker>
      </MapContainer>
      {map && <MapButtons map={map} lang={lang} center={center} located={located} onLocate={onLocate} />}
      <Legend lang={lang} layers={layers} palette={palette} />
      {layers.cctv && !showCams && (
        <p className="pointer-events-none absolute bottom-6 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-ink/85 px-3 py-1 text-xs text-panel">
          {t('map.zoomForCctv', lang)}
        </p>
      )}
    </div>
  );
}

/** Zone polygons coloured by the worst reading inside; tap to drill down. */
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

/** Zooms to the area the user drilled into; back at the top level, returns to the region. */
function FitToFocus({ focus, depth, center }: { focus: ZoneFeature | null; depth: number; center: LatLng }) {
  const map = useMap();
  const last = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const key = focus?.properties.id ?? null;
    if (last.current === undefined) {
      last.current = key; // don't move on first render
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
  return null;
}

/** When the browser first returns a real position, move the map there once. */
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

/** Rendered outside the Leaflet container (so React click handlers work) and drives the map through its instance. */
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
    'grid size-11 place-items-center rounded-lg border border-line bg-panel text-ink shadow-sm hover:bg-ground disabled:opacity-60';
  return (
    <div className="absolute bottom-8 left-2.5 z-[1000] flex flex-col items-start gap-2">
      {hint && <p className="max-w-[220px] rounded-lg bg-ink/90 px-2.5 py-1.5 text-xs text-panel">{hint}</p>}
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
    <div className="flex min-w-[160px] flex-col gap-1 font-sans text-[13px] leading-snug">
      <strong className="text-sm">{title}</strong>
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
    <span className="text-xs text-muted">
      {t('popup.time', lang)} {time}
    </span>
  );
}

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

function Legend({ lang, layers, palette }: { lang: Lang; layers: Layers; palette: MapPalette }) {
  const [open, setOpen] = useState(() => window.innerWidth >= WEB.map.legendOpenMinWidth);
  const c = palette.severity;
  const row = 'flex items-center gap-2';
  return (
    <div className="absolute top-3 right-3 z-[1000] flex max-w-[210px] flex-col gap-1.5 rounded-xl border border-line bg-panel/95 px-3 py-2 text-xs text-ink-2 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-7 items-center justify-between gap-3 text-[13px] font-semibold text-ink"
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
                className="grid size-[18px] shrink-0 place-items-center rounded-[5px] border-2 border-white text-[7px] font-bold text-white shadow-sm"
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
        </>
      )}
    </div>
  );
}
