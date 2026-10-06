import { compassPoint, DEFAULT_CONFIG, type Alert, type DashboardSnapshot, type PushKind, type Severity, type WeatherNow } from '@hw/core';
import { t, type Lang, type MessageKey } from '@hw/core/i18n';
import provincesFile from '../../web/public/geo/provinces.json';
import { fetchSnapshot, fetchWeather, siteLink } from './api';
import { EXT } from './config';
import { alertSeverity, DISTRICTS, districtAt, districtById, feedStatuses, floodInDistrict, localAlerts, nearestLive, wantedAlerts, type Place } from './status';
import { getSettings, saveSettings, type Settings } from './storage';

const cfg = DEFAULT_CONFIG;
const app = document.getElementById('app')!;
const provinces = (provincesFile as unknown as { features: { properties: { id: string; name_th: string; name_en: string } }[] }).features.map((f) => f.properties);

let settings: Settings;
let snapshot: DashboardSnapshot | null = null;
let weather: WeatherNow | null = null;
let error: MessageKey | null = null;

/** Tiny element helper: el('div', { class: 'card' }, child, 'text'). */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string | null | false)[]) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) if (c) node.append(c);
  return node;
}

const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(key, settings.lang, vars);
const pill = (sev: Severity, label = tr(`severity.${sev}`)) => el('span', { class: `pill sev-${sev}` }, label);
const name = (o: { name: { th: string; en: string } }) => o.name[settings.lang] || o.name.th;

function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 2) return tr('ext.ago.now');
  return min < 120 ? tr('ext.ago.min', { n: min }) : tr('ext.ago.hour', { n: Math.round(min / 60) });
}

/** Arrow pointing where the wind blows to. */
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
  await saveSettings({ place });
  await load();
  void chrome.runtime.sendMessage({ type: 'check' });
}

function locate() {
  error = null;
  app.replaceChildren(el('p', { class: 'muted' }, tr('ext.locating')));
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

function districtPicker() {
  const select = el('select', { 'aria-label': tr('ext.pickDistrict') }, el('option', { value: '' }, tr('ext.pickDistrict')));
  const key = settings.lang === 'th' ? 'name_th' : 'name_en';
  for (const p of provinces) {
    const group = el('optgroup', { label: p[key] });
    DISTRICTS.filter((d) => d.properties.parent === p.id)
      .sort((a, b) => a.properties[key].localeCompare(b.properties[key], settings.lang))
      .forEach((d) => group.append(el('option', { value: d.properties.id }, d.properties[key])));
    select.append(group);
  }
  select.value = settings.place?.source === 'picked' ? settings.place.districtId : '';
  select.addEventListener('change', () => {
    const d = districtById(select.value);
    if (!d) return;
    const [minLng, minLat, maxLng, maxLat] = d.properties.bbox;
    void setPlace({ location: { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 }, districtId: d.properties.id, source: 'picked' });
  });
  return select;
}

function placeCard() {
  const d = settings.place ? districtById(settings.place.districtId) : null;
  return el(
    'section',
    { class: 'card' },
    d && el('div', { class: 'area' }, settings.lang === 'th' ? d.properties.name_th : d.properties.name_en),
    error && el('p', { class: 'muted' }, tr(error)),
    el('div', { class: 'row' }, Object.assign(el('button', { type: 'button' }, tr('ext.useGps')), { onclick: locate }), districtPicker()),
  );
}

function alertsCard(alerts: Alert[], areaName: string) {
  const sev = alertSeverity(alerts);
  return el(
    'section',
    { class: 'card' },
    el('div', { class: 'row between' }, el('h2', {}, tr('push.title')), pill(sev)),
    alerts.length
      ? el('ul', {}, ...alerts.map((a) => el('li', { class: `alert sev-${a.severity}` }, el('b', {}, a.title[settings.lang]), a.body[settings.lang])))
      : el('p', {}, tr('ext.allClear', { area: areaName })),
  );
}

function readingsCard(snap: DashboardSnapshot, place: Place) {
  const district = districtById(place.districtId)!;
  const cells: HTMLElement[] = [];

  if (weather) {
    const temp = weather.temperatureC === null ? '–' : `${weather.temperatureC.toFixed(1)}${cfg.units.temperature}`;
    const rain = weather.precipitationMm === null ? '–' : `${weather.precipitationMm.toFixed(1)} ${cfg.units.precipitation}`;
    cells.push(el('div', {}, el('h2', {}, tr('card.weather')), el('div', { class: 'big' }, temp), el('div', { class: 'muted' }, `${tr('weather.rainNow')} ${rain}`)));
    const from = weather.windFromDeg;
    const aloft = weather.cloudWindFromDeg;
    if (from != null && weather.windSpeedKmh != null) {
      const drift =
        aloft != null && weather.cloudWindSpeedKmh != null
          ? weather.cloudWindSpeedKmh < EXT.driftCalmKmh
            ? tr('radar.driftCalm')
            : tr('radar.drift', { dir: tr(`compass.${compassPoint(aloft + 180)}`), speed: `${Math.round(weather.cloudWindSpeedKmh)} ${cfg.units.windSpeed}` })
          : null;
      cells.push(
        el(
          'div',
          {},
          el('h2', {}, tr('weather.wind')),
          el('div', {}, arrow(from), ` ${tr('weather.windFrom', { dir: tr(`compass.${compassPoint(from)}`) })} · ${Math.round(weather.windSpeedKmh)} ${cfg.units.windSpeed}`),
          drift && el('div', { class: 'muted', title: tr('radar.driftNote') }, drift),
        ),
      );
    }
  }

  const pm = nearestLive(snap.edge?.feeds.pm25?.items, place.location);
  if (pm)
    cells.push(
      el('div', {}, el('h2', {}, tr('ext.nearestPm')), el('div', { class: 'row' }, el('span', { class: 'big' }, String(pm.value)), pill(pm.severity)), el('div', { class: 'muted' }, `${name(pm)} · ${tr('ext.km', { km: pm.km.toFixed(1) })}`)),
    );

  const water = nearestLive(snap.runner?.feeds.waterlevel?.items, place.location);
  if (water)
    cells.push(
      el(
        'div',
        {},
        el('h2', {}, tr('ext.nearestWater')),
        el('div', { class: 'row' }, el('span', { class: 'big' }, `${Math.round(water.value!)}%`), pill(water.severity)),
        el('div', { class: 'muted' }, `${name(water)} · ${tr('ext.km', { km: water.km.toFixed(1) })}`),
      ),
    );

  const flood = floodInDistrict(snap, district);
  if (flood)
    cells.push(el('div', {}, el('h2', {}, tr('ext.flood')), pill(flood.severity), el('div', { class: 'muted' }, tr('ext.floodCount', flood))));

  return cells.length ? el('section', { class: 'card grid' }, ...cells) : null;
}

function feedsCard(snap: DashboardSnapshot) {
  const items = feedStatuses(snap).sort((a, b) => (a.state === 'ok' ? 1 : 0) - (b.state === 'ok' ? 1 : 0));
  return el(
    'section',
    { class: 'card' },
    el('h2', {}, tr('ext.feeds')),
    el(
      'ul',
      { class: 'feeds' },
      ...items.map((f) =>
        el(
          'li',
          {},
          el('span', {}, el('span', { class: `dot ${f.state}` }), tr(`ext.feed.${f.key}`)),
          el('span', { class: 'muted' }, f.lastOkAt ? tr(`ext.feed.${f.state}`, { ago: ago(f.lastOkAt) }) : tr('ext.feed.never')),
        ),
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
    return el('label', {}, box, tr(`push.kind.${k}`));
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
    el('label', {}, notify, tr('ext.notify')),
    el('p', { class: 'muted' }, tr('ext.notifyNote', { n: EXT.pollMinutes })),
    el('p', { class: 'muted' }, tr('push.kinds')),
    ...kinds,
    el('label', {}, tr('push.pmAt'), pm),
  );
}

function render() {
  document.documentElement.lang = settings.lang;
  const header = el(
    'header',
    {},
    el('h1', {}, tr('app.name')),
    Object.assign(el('button', { type: 'button', class: 'link' }, tr('ext.otherLang')), {
      onclick: async () => {
        settings.lang = settings.lang === 'th' ? 'en' : 'th';
        await saveSettings({ lang: settings.lang });
        render();
      },
    }),
  );
  const parts: (HTMLElement | null)[] = [header, placeCard()];
  const place = settings.place;
  const district = place ? districtById(place.districtId) : null;

  if (place && district && snapshot) {
    const areaName = settings.lang === 'th' ? district.properties.name_th : district.properties.name_en;
    // Same list as the badge and notifications, so the three never disagree.
    const alerts = wantedAlerts(localAlerts(snapshot, district), settings);
    parts.push(alertsCard(alerts, areaName), readingsCard(snapshot, place), feedsCard(snapshot));
  } else if (place && !snapshot && error === 'ext.loadFailed') {
    parts.push(el('p', { class: 'card' }, tr('ext.loadFailed')));
  }
  parts.push(settingsCard());
  parts.push(
    Object.assign(el('button', { type: 'button', class: 'primary' }, tr('ext.open')), {
      onclick: () => chrome.tabs.create({ url: siteLink(settings.lang, place?.districtId) }),
    }),
  );
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

settings = await getSettings();
render();
if (!settings.place) locate();
else void load();
