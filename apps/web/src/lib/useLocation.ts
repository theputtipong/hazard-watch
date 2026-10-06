'use client';

import { useCallback, useEffect, useState } from 'react';
import { regionFor, type LatLng } from '@hw/core';
import { WEB } from '@/config';

export type LocationStatus = 'pending' | 'granted' | 'denied' | 'unsupported';

/** Coordinates never leave the device here. */
export function useLocation() {
  const [location, setLocation] = useState<LatLng>(() => regionFor(null).center);
  const [status, setStatus] = useState<LocationStatus>('pending');

  const locate = useCallback(
    () =>
      new Promise<LatLng | null>((resolve) => {
        if (!('geolocation' in navigator)) {
          setStatus('unsupported');
          return resolve(null);
        }
        setStatus((s) => (s === 'granted' ? s : 'pending'));
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setLocation(next);
            setStatus('granted');
            resolve(next);
          },
          () => {
            setStatus('denied');
            resolve(null);
          },
          { enableHighAccuracy: false, maximumAge: WEB.location.maximumAgeMs, timeout: WEB.location.timeoutMs },
        );
      }),
    [],
  );

  useEffect(() => {
    void locate();
  }, [locate]);

  return { location, status, locate };
}
