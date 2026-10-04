'use client';

import 'leaflet/dist/leaflet.css';
import { useState } from 'react';
import { CircleMarker, ImageOverlay, MapContainer, Marker, TileLayer, Tooltip, useMapEvents } from 'react-leaflet';
import { regionFor, type CctvCamera, type LatLng, type Observation, type Severity } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';
import { WEB } from '@/config';
import { radarImageUrl } from '@/lib/api';
import { RADAR_BOUNDS, type Layers } from '@/lib/layers';
import { cctvIcon, floodIcon, LEGEND_GLYPH, pm25Icon, youIcon } from './mapIcons';

interface Props {
  lang: Lang;
  center: LatLng;
  layers: Layers;
  radarId: string;
  floodPoints: Observation[];
  pmStations: Observation[];
  cameras: CctvCamera[];
}

/** Draw order: problems above normal points, and "you" above everything. */
const Z = { cctv: 100, pm25: 200, flood: 300, you: 1000 } as const;
const FLOOD_RANK: Record<Severity, number> = { ok: 0, watch: 1, warn: 2, danger: 3 };

export default function MapView({ lang, center, layers, radarId, floodPoints, pmStations, cameras }: Props) {
  const bounds = RADAR_BOUNDS[radarId];
  const startZoom = regionFor(center).zoom;
  const [zoom, setZoom] = useState(startZoom);
  const showCams = layers.cctv && zoom >= WEB.map.cctvMinZoom;
  const online = floodPoints.filter((p) => !p.offline);
  const normal = online.filter((p) => p.severity === 'ok');
  const problems = online.filter((p) => p.severity !== 'ok').sort((a, b) => FLOOD_RANK[a.severity] - FLOOD_RANK[b.severity]);

  return (
    <div className="relative">
      <MapContainer center={[center.lat, center.lng]} zoom={startZoom} scrollWheelZoom className="h-[420px] w-full sm:h-[520px]">
        <TileLayer attribution={WEB.map.attribution} url={WEB.map.tileUrl} />
        <ZoomWatcher onZoom={setZoom} />
        {layers.radar && bounds && <ImageOverlay url={radarImageUrl(radarId)} bounds={bounds} opacity={WEB.map.radarOpacity} />}

        {showCams &&
          cameras.map((c) => (
            <Marker key={c.id} position={[c.location.lat, c.location.lng]} icon={cctvIcon()} zIndexOffset={Z.cctv}>
              <Tooltip>{c.name[lang]}</Tooltip>
            </Marker>
          ))}

        {layers.pm25 &&
          pmStations
            .filter((s) => s.value !== null)
            .map((s) => (
              <Marker key={s.id} position={[s.location.lat, s.location.lng]} icon={pm25Icon(s.value!, s.severity)} zIndexOffset={Z.pm25}>
                <Tooltip>
                  {s.name[lang]} · PM2.5 {s.value} {s.unit}
                </Tooltip>
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
              <Tooltip>
                {p.name[lang]} · {t('flood.normal', lang)}
              </Tooltip>
            </CircleMarker>
          ))}
        {layers.flood &&
          problems.map((p) => (
            <Marker
              key={p.id}
              position={[p.location.lat, p.location.lng]}
              icon={floodIcon(p.severity as Exclude<Severity, 'ok'>)}
              zIndexOffset={Z.flood + FLOOD_RANK[p.severity]}
            >
              <Tooltip>
                {p.name[lang]} · {t(`severity.${p.severity}`, lang)}
                {p.value !== null && ` · ${p.value} ${p.unit}`}
              </Tooltip>
            </Marker>
          ))}

        <Marker position={[center.lat, center.lng]} icon={youIcon()} zIndexOffset={Z.you}>
          <Tooltip>{t('map.you', lang)}</Tooltip>
        </Marker>
      </MapContainer>
      <Legend lang={lang} layers={layers} />
      {layers.cctv && !showCams && (
        <p className="pointer-events-none absolute bottom-6 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-ink/85 px-3 py-1 text-xs text-white">
          {t('map.zoomForCctv', lang)}
        </p>
      )}
    </div>
  );
}

function ZoomWatcher({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  return null;
}

function Glyph({ bg, paths, size = 18, children }: { bg: string; paths?: string; size?: number; children?: React.ReactNode }) {
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

function Legend({ lang, layers }: { lang: Lang; layers: Layers }) {
  const c = WEB.severityColor;
  const row = 'flex items-center gap-2';
  return (
    <div className="absolute top-3 right-3 z-[1000] flex max-w-[210px] flex-col gap-1.5 rounded-xl border border-line bg-panel/95 px-3 py-2.5 text-xs text-ink-2 shadow-sm">
      <strong className="text-[13px]">{t('map.legend', lang)}</strong>
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
    </div>
  );
}
