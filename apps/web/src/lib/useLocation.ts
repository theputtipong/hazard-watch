'use client';

import { useEffect, useState } from 'react';
import { regionFor, type LatLng } from '@hw/core';

export type LocationStatus = 'pending' | 'granted' | 'denied' | 'unsupported';

/** Browser location, falling back to the centre of the first active region. Coordinates never leave the device here. */
export function useLocation() {
  const [location, setLocation] = useState<LatLng>(() => regionFor(null).center);
  const [status, setStatus] = useState<LocationStatus>('pending');

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus('granted');
      },
      () => setStatus('denied'),
      { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 15_000 },
    );
  }, []);

  return { location, status };
}
