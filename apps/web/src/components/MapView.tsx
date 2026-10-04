'use client';

import 'leaflet/dist/leaflet.css';
import { CircleMarker, ImageOverlay, MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import { regionFor, type CctvCamera, type LatLng, type Observation } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';
import { WEB } from '@/config';
import { radarImageUrl } from '@/lib/api';
import { RADAR_BOUNDS, type Layers } from '@/lib/layers';
import { DOT_COLOR } from './Severity';

interface Props {
  lang: Lang;
  center: LatLng;
  layers: Layers;
  radarId: string;
  floodPoints: Observation[];
  pmStations: Observation[];
  cameras: CctvCamera[];
}

export default function MapView({ lang, center, layers, radarId, floodPoints, pmStations, cameras }: Props) {
  const bounds = RADAR_BOUNDS[radarId];
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={regionFor(center).zoom} scrollWheelZoom className="h-[420px] w-full sm:h-[520px]">
      <TileLayer
        attribution={WEB.map.attribution}
        url={WEB.map.tileUrl}
      />
      {layers.radar && bounds && <ImageOverlay url={radarImageUrl(radarId)} bounds={bounds} opacity={WEB.map.radarOpacity} />}
      {layers.flood &&
        floodPoints
          .filter((p) => !p.offline)
          .map((p) => (
            <CircleMarker
              key={p.id}
              center={[p.location.lat, p.location.lng]}
              radius={p.severity === 'ok' ? WEB.map.markerRadius.floodNormal : WEB.map.markerRadius.floodAlert}
              pathOptions={{ color: '#fff', weight: 2, fillColor: p.severity === 'ok' ? WEB.floodNormalColor : DOT_COLOR[p.severity], fillOpacity: 1 }}
            >
              <Tooltip>
                {p.name[lang]} · {t(`severity.${p.severity}`, lang)}
              </Tooltip>
            </CircleMarker>
          ))}
      {layers.pm25 &&
        pmStations
          .filter((s) => s.value !== null)
          .map((s) => (
            <CircleMarker
              key={s.id}
              center={[s.location.lat, s.location.lng]}
              radius={WEB.map.markerRadius.pm25}
              pathOptions={{ color: '#fff', weight: 2, fillColor: DOT_COLOR[s.severity], fillOpacity: 0.9 }}
            >
              <Tooltip>
                {s.name[lang]} · PM2.5 {s.value}
              </Tooltip>
            </CircleMarker>
          ))}
      {layers.cctv &&
        cameras.map((c) => (
          <CircleMarker key={c.id} center={[c.location.lat, c.location.lng]} radius={WEB.map.markerRadius.cctv} pathOptions={{ color: '#fff', weight: 1.5, fillColor: '#0f1b2d', fillOpacity: 1 }}>
            <Tooltip>{c.name[lang]}</Tooltip>
          </CircleMarker>
        ))}
      <CircleMarker center={[center.lat, center.lng]} radius={WEB.map.markerRadius.you} pathOptions={{ color: '#fff', weight: 3, fillColor: '#1f5fbf', fillOpacity: 1 }}>
        <Tooltip>{t('map.you', lang)}</Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}
