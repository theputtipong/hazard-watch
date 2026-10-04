'use client';

import type { PushKind } from '@hw/core';
import type { Lang } from '@hw/core/i18n';
import { API_BASE } from './api';

export interface PushPrefs {
  kinds: PushKind[];
  pm25At: number;
}

export type PushSupport = 'ok' | 'unsupported' | 'ios-needs-install';

const PREFS_KEY = 'hw.push';

export function pushSupport(): PushSupport {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return 'ios-needs-install';
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window ? 'ok' : 'unsupported';
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export function savedPrefs(): { prefs: PushPrefs; district: string; subdistrict: string | null } | null {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/** Asks permission, subscribes this browser and registers the area + preferences with the server. */
export async function subscribe(input: { lang: Lang; district: string; subdistrict: string | null; prefs: PushPrefs }) {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('denied');
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { publicKey } = (await (await fetch(`${API_BASE}/v1/push/key`)).json()) as { publicKey: string };
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(publicKey) }));
  await post('/v1/push/subscribe', { subscription: sub.toJSON(), lang: input.lang, district: input.district, subdistrict: input.subdistrict, prefs: input.prefs });
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ prefs: input.prefs, district: input.district, subdistrict: input.subdistrict }));
  } catch {
    // Not remembered locally; the server still has the subscription.
  }
}

export async function unsubscribe() {
  const sub = await currentSubscription();
  if (sub) {
    await post('/v1/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
  try {
    localStorage.removeItem(PREFS_KEY);
  } catch {
    // Nothing to clean.
  }
}

export async function sendTest() {
  const sub = await currentSubscription();
  if (!sub) throw new Error('not subscribed');
  return post('/v1/push/test', { endpoint: sub.endpoint });
}
