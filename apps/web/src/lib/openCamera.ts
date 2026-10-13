import type { CctvCamera } from '@hw/core';
import { WEB } from '@/config';

/** BMA Traffic only serves plain http, so that one host is allowed without TLS. */
export function safeCameraUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' || (url.protocol === 'http:' && url.host === 'www.bmatraffic.com')) return url.href;
  } catch {
    // Not a URL.
  }
  return null;
}

/**
 * BMA Traffic shows a camera only after its main page has created a session, so open that page first
 * and then move the tab to the camera. Must run from a click so the browser allows the new tab.
 */
export function openCamera(cam: Pick<CctvCamera, 'viewUrl' | 'sessionUrl'>) {
  const viewUrl = safeCameraUrl(cam.viewUrl);
  if (!viewUrl) return;
  const sessionUrl = safeCameraUrl(cam.sessionUrl);
  if (!sessionUrl) {
    window.open(viewUrl, '_blank', 'noopener');
    return;
  }
  const tab = window.open(sessionUrl, '_blank');
  if (!tab) {
    // Pop-up blocked.
    window.location.href = viewUrl;
    return;
  }
  window.setTimeout(() => {
    try {
      tab.location.href = viewUrl;
    } catch {
      // The tab was closed by the user; nothing to do.
    }
  }, WEB.cctv.sessionDelayMs);
}
