import {
  agoText,
  clockText,
  compassPoint,
  DEFAULT_CONFIG,
  feedAgeText,
  feedStatuses,
  pm25Severity,
  rank,
  SOURCE_META,
  type Alert,
  type DashboardSnapshot,
  type PushKind,
  type Severity,
  type WeatherNow,
} from '@hw/core';
import { t, type Lang, type MessageKey } from '@hw/core/i18n';
import { fetchSnapshot, fetchWeather, siteLink } from './api';
import { EXT } from './config';
import { DISTRICTS, PROVINCES, damLines, districtAt, districtById, districtCenter, floodInDistrict, localAlerts, nasaLines, nearestLive, wantedAlerts, type Place } from './status';
import { getSettings, saveSettings, type Settings } from './storage';

// --- Pure picker helpers (exported for tests; no DOM) ---

export interface PickItem {
  id: string;
  parent: string | null;
  name_th: string;
  name_en: string;
}

/** Case- and space-insensitive key, so "chiang mai", "ChiangMai" and "เชียง ใหม่" all match. */
export const fold = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, '');

const byName = (lang: Lang) => (a: PickItem, b: PickItem) => (lang === 'th' ? a.name_th : a.name_en).localeCompare(lang === 'th' ? b.name_th : b.name_en, lang);

const matches = (item: PickItem, q: string) => fold(item.name_th).includes(q) || fold(item.name_en).includes(q);

/** Province id → its districts, sorted by name in the UI language. */
export function groupDistricts(districts: PickItem[], lang: Lang): Map<string, PickItem[]> {
  const out = new Map<string, PickItem[]>();
  for (const d of districts) {
    if (!d.parent) continue;
    const list = out.get(d.parent);
    if (list) list.push(d);
    else out.set(d.parent, [d]);
  }
  for (const list of out.values()) list.sort(byName(lang));
  return out;
}

/**
 * Provinces and districts left after the text filter. A province whose name matches keeps
 * all its districts; a district whose name matches keeps its province.
 */
export function filterPlaces(query: string, provinces: PickItem[], byProvince: Map<string, PickItem[]>, lang: Lang) {
  const q = fold(query);
  const districts = new Map<string, PickItem[]>();
  const kept: PickItem[] = [];
  for (const p of provinces) {
    const all = byProvince.get(p.id) ?? [];
    const hit = !q || matches(p, q) ? all : all.filter((d) => matches(d, q));
    if (!hit.length && q && !matches(p, q)) continue;
    kept.push(p);
    districts.set(p.id, hit);
  }
  return { provinces: kept.sort(byName(lang)), districts };
}

/** Dam card credit: ThaiWater (HII) as data publisher, linked to its site. */
export function damCredit(lang: Lang): { label: string; href: string } {
  return { label: lang === 'th' ? 'ThaiWater (สสน.)' : 'ThaiWater (HII)', href: SOURCE_META.thaiwater.url };
}

/** Saved district id (incl. pre-77-province Greater Bangkok ids, which kept their ids) → picker state. */
export function restorePick(districtId: string | null | undefined, districts: PickItem[]): { provinceId: string; districtId: string } | null {
  const d = districtId ? districts.find((x) => x.id === districtId) : undefined;
  return d?.parent ? { provinceId: d.parent, districtId: d.id } : null;
}

/** Province to show after filtering: keep the current one if still listed, else the first hit. */
export function pickProvince(current: string, shown: PickItem[], query: string): string {
  if (shown.some((p) => p.id === current)) return current;
  return fold(query) ? (shown[0]?.id ?? '') : '';
}

// --- Popup ---

const cfg = DEFAULT_CONFIG;
const DISTRICT_ITEMS: PickItem[] = DISTRICTS.map((d) => d.properties);
const PROVINCE_ITEMS: PickItem[] = PROVINCES;
let app: HTMLElement;
/** Picker state survives re-renders so the filter is not lost after picking. */
let query = '';
let provinceId = '';

let settings: Settings;
let snapshot: DashboardSnapshot | null = null;
let weather: WeatherNow | null = null;
let error: MessageKey | null = null;

type Child = Node | string | null | false | undefined;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: Child[]) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) if (c) node.append(c);
  return node;
}

function button(label: string, cls: string, onclick: () => void) {
  const b = el('button', { type: 'button', class: cls }, label);
  b.onclick = onclick;
  return b;
}

const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(key, settings.lang, vars);
const name = (o: { name: { th: string; en: string } }) => o.name[settings.lang] || o.name.th;

/** Level is the count of filled bars, so it reads without colour. */
function meter(sev: Severity, large = false) {
  return el('span', { class: large ? 'meter meter--lg' : 'meter', 'data-level': String(rank(sev)), 'aria-hidden': 'true' }, el('i'), el('i'), el('i'));
}
const badge = (sev: Severity) => el('span', { class: `sev sev--${rank(sev)}` }, meter(sev), tr(`severity.${sev}`));

/** Points where the wind blows to. */
function arrow(fromDeg: number) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'arrow');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.transform = `rotate(${fromDeg + 180}deg)`;
  svg.innerHTML = '<path d="M12 2 L19 20 L12 16 L5 20 Z" fill="currentColor"/>';
  return svg;
}

async function setPlace(place: Place) {
  settings.place = place;
  // A GPS fix should show its own province, not one hidden by an old filter.
  if (place.source === 'gps') query = '';
  provinceId = restorePick(place.districtId, DISTRICT_ITEMS)?.provinceId ?? provinceId;
  await saveSettings({ place });
  await load();
  void chrome.runtime.sendMessage({ type: 'check' });
}

function locate() {
  error = null;
  app.replaceChildren(el('p', { class: 'caption' }, tr('ext.locating')));
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const location = { lat: coords.latitude, lng: coords.longitude };
      const d = districtAt(location);
      if (!d) {
        error = 'ext.outside';
        render();
        return;
      }
      void setPlace({ location, districtId: d.properties.id, source: 'gps' });
    },
    () => {
      error = 'ext.gpsFailed';
      render();
    },
    { timeout: 10_000, maximumAge: 5 * 60_000 },
  );
}

function field(id: string, label: string, control: HTMLElement) {
  control.id = id;
  return el('div', { class: 'field' }, el('label', { for: id, class: 'field__label' }, label), control);
}

function areaPicker() {
  const lang = settings.lang;
  const key = lang === 'th' ? 'name_th' : 'name_en';
  const byProvince = groupDistricts(DISTRICT_ITEMS, lang);
  const saved = settings.place?.districtId ?? '';
  if (!provinceId) provinceId = restorePick(saved, DISTRICT_ITEMS)?.provinceId ?? '';

  const filter = el('input', { type: 'search', autocomplete: 'off', spellcheck: 'false', 'aria-controls': 'pick-province pick-district' });
  filter.value = query;
  const province = el('select', {});
  const district = el('select', {});

  const fill = () => {
    const { provinces, districts } = filterPlaces(query, PROVINCE_ITEMS, byProvince, lang);
    provinceId = pickProvince(provinceId, provinces, query);
    province.replaceChildren(el('option', { value: '' }, tr('area.pickProvince')), ...provinces.map((p) => el('option', { value: p.id }, p[key])));
    province.value = provinceId;
    const list = districts.get(provinceId) ?? [];
    district.replaceChildren(el('option', { value: '' }, tr('ext.pickDistrict')), ...list.map((d) => el('option', { value: d.id }, d[key])));
    district.value = list.some((d) => d.id === saved) ? saved : '';
    district.disabled = !provinceId;
  };

  filter.addEventListener('input', () => {
    query = filter.value;
    fill();
  });
  province.addEventListener('change', () => {
    provinceId = province.value;
    // No auto-focus: arrow keys on a closed select fire change per step on some platforms.
    fill();
  });
  district.addEventListener('change', () => {
    const d = districtById(district.value);
    if (!d) return;
    void setPlace({ location: districtCenter(d), districtId: d.properties.id, source: 'picked' });
  });
  fill();

  return el(
    'div',
    { class: 'picker' },
    field('pick-filter', tr('area.searchDistrict'), filter),
    el('div', { class: 'picker__selects' }, field('pick-province', tr('area.pickProvince'), province), field('pick-district', tr('ext.pickDistrict'), district)),
  );
}

function placeCard() {
  const d = settings.place ? districtById(settings.place.districtId) : null;
  const p = d?.properties.parent ? PROVINCE_ITEMS.find((x) => x.id === d.properties.parent) : undefined;
  const nm = (x: PickItem) => (settings.lang === 'th' ? x.name_th : x.name_en);
  return el(
    'section',
    { class: 'card' },
    d && el('div', {}, el('h2', { class: 'area' }, nm(d.properties)), p && el('p', { class: 'caption' }, nm(p))),
    error && el('p', { class: 'label' }, tr(error)),
    el('div', { class: 'row' }, button(tr('location.useMine'), 'btn btn--sm', locate)),
    areaPicker(),
  );
}

/** At most two short lines; the title and disclaimer carry the NASA attribution. */
function nasaCard(lines: string[]) {
  if (!lines.length) return null;
  return el(
    'section',
    { class: 'card nasa' },
    el('h2', { class: 'label muted' }, tr('nasa.card.title')),
    el('ul', { class: 'nasa__lines' }, ...lines.slice(0, 2).map((l) => el('li', {}, l))),
    el('p', { class: 'caption' }, tr('nasa.disclaimer')),
  );
}

/** Display only, never notified: at most two dams near the place, with the ThaiWater credit. */
function damCard(lines: string[]) {
  if (!lines.length) return null;
  const credit = damCredit(settings.lang);
  return el(
    'section',
    { class: 'card dams' },
    el('h2', { class: 'label muted' }, tr('card.dam')),
    el('ul', { class: 'dams__lines' }, ...lines.slice(0, 2).map((l) => el('li', {}, l))),
    el('p', { class: 'caption' }, `${tr('dam.note')} · `, el('a', { class: 'link', href: credit.href, target: '_blank', rel: 'noopener noreferrer' }, credit.label)),
  );
}

function alertsSection(alerts: Alert[]) {
  if (!alerts.length) return el('p', { class: 'calm', role: 'status' }, tr('ext.allClear'));
  const shown = alerts.slice(0, EXT.maxBanners);
  return el(
    'section',
    { class: 'stack', style: 'display:grid;gap:8px' },
    ...shown.map((a) =>
      el(
        'div',
        { class: `alert alert--${rank(a.severity)}`, role: a.severity === 'danger' ? 'alert' : 'status' },
        el('span', { class: 'alert__icon' }, meter(a.severity, true)),
        el('div', {}, el('p', { class: 'alert__title' }, a.title[settings.lang]), el('p', { class: 'alert__body' }, a.body[settings.lang])),
      ),
    ),
    alerts.length > shown.length &&
      button(tr('ext.seeAll', { n: alerts.length }), 'link', () => chrome.tabs.create({ url: siteLink(settings.lang, settings.place?.districtId) })),
  );
}

function reading(label: string, sev: Severity | null, value: Child, note: Child, source: string) {
  return el(
    'div',
    { class: 'reading' },
    el('div', { class: 'reading__head' }, el('span', { class: 'reading__label' }, label), sev && badge(sev)),
    value,
    note && el('p', { class: 'reading__note' }, note),
    el('p', { class: 'caption' }, source),
  );
}

function gauge(label: string, pct: number, sev: Severity) {
  const w = cfg.waterLevel;
  const pos = (p: number) => `${(Math.min(p, 130) / 130) * 100}%`;
  const state = tr(`gauge.state.${sev}`);
  return el(
    'div',
    { class: 'gauge', 'data-level': String(rank(sev)), role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '130', 'aria-valuenow': String(Math.min(Math.round(pct), 130)), 'aria-valuetext': `${label}: ${tr('gauge.aria', { state, v: Math.round(pct) })}` },
    el('div', { class: 'gauge__top' }, el('span', { class: 'gauge__name' }, label), el('span', { class: 'gauge__pct' }, `${state} · ${Math.round(pct)}%`)),
    el(
      'div',
      { class: 'gauge__track', 'aria-hidden': 'true' },
      el('div', { class: 'gauge__fill', style: `width:${pos(pct)}` }),
      ...[w.watchPct, w.warnPct, w.dangerPct].map((p) => el('span', { class: 'gauge__tick', style: `left:${pos(p)}` })),
    ),
  );
}

const sourceLine = (key: MessageKey, iso?: string) => (iso ? `${tr(key)} · ${clockText(iso, settings.lang)}` : tr(key));

function readingsCard(snap: DashboardSnapshot, place: Place) {
  const district = districtById(place.districtId)!;
  const rows: HTMLElement[] = [];

  const pm = nearestLive(snap.edge?.feeds.pm25?.items, place.location);
  if (pm) {
    const sev = pm25Severity(pm.value!, cfg);
    rows.push(
      reading(
        tr('ext.pm25At', { name: name(pm) }),
        sev,
        el('div', { class: 'reading__value' }, el('span', { class: 'figure-sm' }, String(pm.value)), el('span', { class: 'reading__unit' }, cfg.units.pm25)),
        tr(`note.pm25.${sev}`),
        `${sourceLine('source.pm25', pm.observedAt)} · ${tr('ext.km', { km: pm.km.toFixed(1) })}`,
      ),
    );
  }

  const water = nearestLive(snap.runner?.feeds.waterlevel?.items, place.location);
  if (water)
    rows.push(
      reading(tr('card.water'), null, gauge(name(water), water.value!, water.severity), tr('gauge.intro'), `${sourceLine('source.water', water.observedAt)} · ${tr('ext.km', { km: water.km.toFixed(1) })}`),
    );

  const flood = floodInDistrict(snap, district);
  if (flood) rows.push(reading(tr('ext.flood'), flood.severity, null, tr('ext.floodCount', flood), tr('source.flood')));

  if (weather && weather.temperatureC !== null) {
    const parts: Child[] = [];
    if (weather.precipitationMm !== null) parts.push(`${tr('weather.rainNow')} ${weather.precipitationMm.toFixed(1)} ${tr('unit.mm')}`);
    const from = weather.windFromDeg;
    let wind: Child = null;
    if (from != null && weather.windSpeedKmh != null) {
      const aloft = weather.cloudWindFromDeg;
      const drift =
        aloft != null && weather.cloudWindSpeedKmh != null
          ? weather.cloudWindSpeedKmh < EXT.driftCalmKmh
            ? tr('radar.driftCalm')
            : tr('radar.drift', { dir: tr(`compass.${compassPoint(aloft + 180)}`), speed: `${Math.round(weather.cloudWindSpeedKmh)} ${cfg.units.windSpeed}` })
          : null;
      wind = el(
        'span',
        {},
        arrow(from),
        ` ${tr('weather.wind')} ${tr('weather.windFrom', { dir: tr(`compass.${compassPoint(from)}`) })} · ${Math.round(weather.windSpeedKmh)} ${cfg.units.windSpeed}`,
        drift && el('span', { class: 'muted', title: tr('radar.driftNote') }, el('br'), drift),
      );
    }
    rows.push(
      reading(
        tr('card.weather'),
        null,
        el('div', { class: 'reading__value' }, el('span', { class: 'figure-sm' }, `${weather.temperatureC.toFixed(1)}${cfg.units.temperature}`), parts[0] && el('span', { class: 'reading__unit' }, parts[0])),
        wind,
        sourceLine('source.weather', weather.observedAt),
      ),
    );
  }

  return rows.length ? el('section', { class: 'card' }, ...rows) : null;
}

function feedsCard(snap: DashboardSnapshot) {
  const now = new Date();
  return el(
    'section',
    { class: 'card' },
    el('h2', { class: 'label muted' }, tr('feeds.title')),
    el(
      'ul',
      {},
      ...feedStatuses(snap, now).map((f) =>
        el('li', { class: `feed feed--${f.state}` }, el('span', { class: 'feed__mark' }), el('span', {}, tr(`feeds.name.${f.topic}`)), el('span', { class: 'feed__age' }, feedAgeText(f, settings.lang, now))),
      ),
    ),
  );
}

function settingsCard() {
  const save = async (patch: Partial<Settings>) => {
    Object.assign(settings, patch);
    await saveSettings(patch);
    void chrome.runtime.sendMessage({ type: 'check' });
    render();
  };
  const notify = el('input', { type: 'checkbox' });
  notify.checked = settings.notify;
  notify.onchange = () => save({ notify: notify.checked });

  const kinds = (['flood', 'rain', 'water', 'pm25', 'quake'] as PushKind[]).map((k) => {
    const box = el('input', { type: 'checkbox' });
    box.checked = settings.kinds.includes(k);
    box.disabled = !settings.notify;
    box.onchange = () => save({ kinds: box.checked ? [...settings.kinds, k] : settings.kinds.filter((x) => x !== k) });
    return el('label', { class: 'check' }, box, tr(`push.kind.${k}`));
  });

  const pm = el('select', { 'aria-label': tr('push.pmAt') });
  for (const v of EXT.pm25Choices) pm.append(el('option', { value: String(v) }, `${v} ${cfg.units.pm25}`));
  pm.value = String(settings.pm25At);
  pm.disabled = !settings.notify;
  pm.onchange = () => save({ pm25At: Number(pm.value) });

  return el(
    'details',
    { class: 'card' },
    el('summary', {}, tr('ext.settings')),
    el(
      'div',
      { class: 'opts' },
      el('label', { class: 'check' }, notify, tr('ext.notify')),
      el('p', { class: 'caption' }, tr('ext.notifyNote', { n: EXT.pollMinutes })),
      el('p', { class: 'caption' }, tr('push.kinds')),
      ...kinds,
      el('label', { class: 'check' }, tr('push.pmAt'), pm),
    ),
  );
}

function render() {
  document.documentElement.lang = settings.lang;
  const header = el(
    'header',
    {},
    el('img', { src: 'icons/hazardwatch-icon-small.svg', alt: '' }),
    el('h1', {}, tr('app.name')),
    button(tr('ext.otherLang'), 'btn btn--ghost btn--sm', async () => {
      settings.lang = settings.lang === 'th' ? 'en' : 'th';
      await saveSettings({ lang: settings.lang });
      render();
    }),
  );
  const parts: (HTMLElement | null)[] = [header, placeCard()];
  const place = settings.place;
  const district = place ? districtById(place.districtId) : null;

  if (place && district && snapshot) {
    // Same list as the badge and notifications, so the three never disagree.
    const alerts = wantedAlerts(localAlerts(snapshot, district), settings);
    parts.push(alertsSection(alerts), readingsCard(snapshot, place), nasaCard(nasaLines(snapshot, district, settings.lang, { from: place.location })), damCard(damLines(snapshot, place.location, settings.lang)), feedsCard(snapshot));
    const at = snapshot.edge?.updatedAt;
    if (at) parts.push(el('p', { class: 'caption' }, `${tr('common.updated')} ${agoText(at, settings.lang)}`));
  } else if (place && !snapshot && error === 'ext.loadFailed') {
    parts.push(el('p', { class: 'calm' }, tr('ext.loadFailed')));
  }
  parts.push(settingsCard());
  parts.push(button(tr('ext.open'), 'btn btn--primary', () => chrome.tabs.create({ url: siteLink(settings.lang, place?.districtId) })));
  app.replaceChildren(...parts.filter((p): p is HTMLElement => !!p));
}

async function load() {
  error = null;
  const place = settings.place;
  const [snap, w] = await Promise.allSettled([fetchSnapshot(), place ? fetchWeather(place.location) : Promise.reject(new Error('no place'))]);
  snapshot = snap.status === 'fulfilled' ? snap.value : null;
  weather = w.status === 'fulfilled' ? w.value : null;
  if (!snapshot) error = 'ext.loadFailed';
  render();
}

async function main() {
  app = document.getElementById('app')!;
  settings = await getSettings();
  render();
  if (!settings.place) locate();
  else void load();
}

// Tests import the pure helpers above without a DOM.
if (typeof document !== 'undefined') void main();
