'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { Severity } from '@hw/core';
import { WEB } from '@/config';
import { PREF_KEYS } from './prefsScript';

export type ThemePref = 'system' | 'light' | 'dark';
export interface Prefs {
  theme: ThemePref;
  cvd: boolean;
  dark: boolean;
}

const SERVER: Prefs = { theme: 'system', cvd: false, dark: false };
const listeners = new Set<() => void>();
let current: Prefs | null = null;

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

function read(): Prefs {
  let theme: ThemePref = 'system';
  let cvd = false;
  try {
    const t = localStorage.getItem(PREF_KEYS.theme);
    if (t === 'light' || t === 'dark') theme = t;
    cvd = localStorage.getItem(PREF_KEYS.cvd) === 'on';
  } catch {
    // Storage blocked (private mode): fall back to defaults.
  }
  return { theme, cvd, dark: theme === 'dark' || (theme === 'system' && systemDark()) };
}

function write(next: Pick<Prefs, 'theme' | 'cvd'>) {
  try {
    localStorage.setItem(PREF_KEYS.theme, next.theme);
    localStorage.setItem(PREF_KEYS.cvd, next.cvd ? 'on' : 'off');
  } catch {
    // Not persisted, but still applied for this visit.
  }
  current = { ...next, dark: next.theme === 'dark' || (next.theme === 'system' && systemDark()) };
  const root = document.documentElement;
  root.setAttribute('data-theme', current.dark ? 'dark' : 'light');
  root.setAttribute('data-cvd', current.cvd ? 'on' : 'off');
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => (current ??= read());

const THEME_ORDER: ThemePref[] = ['system', 'light', 'dark'];

export function usePrefs() {
  const prefs = useSyncExternalStore(subscribe, snapshot, () => SERVER);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const p = snapshot();
      if (p.theme === 'system') write(p);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return {
    prefs,
    cycleTheme: () => write({ ...prefs, theme: THEME_ORDER[(THEME_ORDER.indexOf(prefs.theme) + 1) % THEME_ORDER.length]! }),
    toggleCvd: () => write({ ...prefs, cvd: !prefs.cvd }),
  };
}

/** Real colour values: SVG/inline styles can't follow CSS variables reliably. */
export interface MapPalette {
  severity: Record<Severity, string>;
  selected: string;
}

export function mapPalette(p: Prefs): MapPalette {
  return {
    severity: p.cvd ? WEB.severityColorCvd : WEB.severityColor[p.dark ? 'dark' : 'light'],
    selected: p.dark ? '#e6ebf3' : '#0f1b2e',
  };
}
