import type { CctvCamera } from '@hw/core';
import { WEB } from '@/config';

/**
 * BMA Traffic shows a camera only after its main page has created a session, so open that page first
 * and then move the tab to the camera. Must run from a click so the browser allows the new tab.
 */
export function openCamera(cam: Pick<CctvCamera, 'viewUrl' | 'sessionUrl'>) {
  if (!cam.sessionUrl) {
    window.open(cam.viewUrl, '_blank', 'noopener');
    return;
  }
  const tab = window.open(cam.sessionUrl, '_blank');
  if (!tab) {
    // Pop-up blocked.
    window.location.href = cam.viewUrl;
    return;
  }
  window.setTimeout(() => {
    try {
      tab.location.href = cam.viewUrl;
    } catch {
      // The tab was closed by the user; nothing to do.
    }
  }, WEB.cctv.sessionDelayMs);
}
