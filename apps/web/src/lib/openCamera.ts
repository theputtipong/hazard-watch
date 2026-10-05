import type { CctvCamera } from '@hw/core';
import { WEB } from '@/config';

/**
 * Opens a camera at its source. BMA Traffic only shows the camera once its main page has created a session,
 * so we open that page in a new tab and then move the same tab to the camera (as a person would on their site).
 * Must be called from a click so the browser allows the new tab.
 */
export function openCamera(cam: Pick<CctvCamera, 'viewUrl' | 'sessionUrl'>) {
  if (!cam.sessionUrl) {
    window.open(cam.viewUrl, '_blank', 'noopener');
    return;
  }
  const tab = window.open(cam.sessionUrl, '_blank');
  if (!tab) {
    // Pop-up blocked: fall back to opening the camera page directly.
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
