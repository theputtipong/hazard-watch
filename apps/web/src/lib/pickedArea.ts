/** Device-only; storage can be blocked (private mode), so every access is guarded. */
const KEY = 'hw.area';
const ZONE_ID = /^TH\d{2}(\d{2}){0,2}$/;

export function loadPickedArea(): string | null {
  try {
    const id = localStorage.getItem(KEY);
    return id && ZONE_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function savePickedArea(id: string | null) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // Not remembered, but still used for this visit.
  }
}
