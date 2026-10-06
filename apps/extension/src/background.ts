import { alertsDue, DEFAULT_CONFIG, sentRetentionMs, type Alert } from '@hw/core';
import { fetchSnapshot, siteLink } from './api';
import { EXT } from './config';
import { alertSeverity, districtById, localAlerts, wantedAlerts } from './status';
import { getSent, getSettings, saveSent } from './storage';

const ALARM = 'poll';

function schedule() {
  chrome.alarms.create(ALARM, { periodInMinutes: EXT.pollMinutes, delayInMinutes: 0.1 });
}

chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) void check();
});

chrome.runtime.onMessage.addListener((msg: { type?: string }, _sender, reply) => {
  if (msg.type !== 'check') return;
  check().then(() => reply({ ok: true }), (err: unknown) => reply({ ok: false, error: String(err) }));
  return true;
});

// Notification ids are "<district id>|<alert key>" so a click can open the right area.
chrome.notifications.onClicked.addListener(async (id) => {
  const { lang } = await getSettings();
  await chrome.tabs.create({ url: siteLink(lang, id.split('|')[0]) });
  chrome.notifications.clear(id);
});

async function setBadge(alerts: Alert[] | null) {
  if (!alerts) {
    await chrome.action.setBadgeText({ text: '?' });
    await chrome.action.setBadgeBackgroundColor({ color: '#566072' });
    await chrome.action.setBadgeTextColor({ color: '#ffffff' });
    return;
  }
  const sev = alertSeverity(alerts);
  await chrome.action.setBadgeText({ text: sev === 'ok' ? '' : String(alerts.length) });
  if (sev !== 'ok') {
    await chrome.action.setBadgeBackgroundColor({ color: EXT.badgeColor[sev] });
    await chrome.action.setBadgeTextColor({ color: EXT.badgeText[sev] });
  }
}

async function check(now = new Date()) {
  const settings = await getSettings();
  const district = settings.place ? districtById(settings.place.districtId) : null;
  if (!district) return setBadge(null);

  const snapshot = await fetchSnapshot();
  const alerts = wantedAlerts(localAlerts(snapshot, district, DEFAULT_CONFIG, now), settings);
  await setBadge(alerts);
  if (!settings.notify) return;

  const sent = await getSent();
  const keep = sentRetentionMs(DEFAULT_CONFIG);
  for (const [key, at] of Object.entries(sent)) if (now.getTime() - Date.parse(at) > keep) delete sent[key];
  const fresh = alertsDue(alerts, new Map(Object.entries(sent)), DEFAULT_CONFIG, now);
  for (const a of fresh) {
    await chrome.notifications.create(`${district.properties.id}|${a.key}`, {
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: a.title[settings.lang],
      message: a.body[settings.lang],
      priority: a.severity === 'danger' ? 2 : 1,
    });
    sent[a.key] = now.toISOString();
  }
  if (fresh.length) await saveSent(sent);
}
