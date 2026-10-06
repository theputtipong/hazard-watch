export const PREF_KEYS = { theme: 'hw.theme', cvd: 'hw.cvd' } as const;

/** Runs in <head> before first paint so the page never flashes the wrong theme. */
export const PREFS_SCRIPT = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('${PREF_KEYS.theme}')||'system';var dark=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);d.setAttribute('data-theme',dark?'dark':'light');d.setAttribute('data-cvd',localStorage.getItem('${PREF_KEYS.cvd}')==='on'?'on':'off');}catch(e){}})();`;
