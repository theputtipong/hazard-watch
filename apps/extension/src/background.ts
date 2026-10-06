/**
 * Background worker: every EXT.pollMinutes reads the public snapshot, builds the same alerts as web push for the
 * person's district, shows the new ones as notifications and keeps the toolbar badge current.
 */
import { DEFAULT_CONFIG, type Alert } from '@hw/core';
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

/** The popup asks for a check after the person changes place or settings. */
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
    await chrome.action.setBadgeBackgroundColor({ color: '#5b6573' });
    return;
  }
  const sev = alertSeverity(alerts);
  await chrome.action.setBadgeText({ text: sev === 'ok' ? '' : String(alerts.length) });
  if (sev !== 'ok') await chrome.action.setBadgeBackgroundColor({ color: EXT.badgeColor[sev] });
}

async function check(now = new Date()) {
  const settings = await getSettings();
  const district = settings.place ? districtById(settings.place.districtId) : null;
  if (!district) return setBadge(null);

  const snapshot = await fetchSnapshot();
  const alerts = wantedAlerts(localAlerts(snapshot, district, DEFAULT_CONFIG, now), settings);
  await setBadge(alerts);
  if (!settings.notify) return;

  const cooldownMs = DEFAULT_CONFIG.push.cooldownHours * 3_600_000;
  const sent = await getSent();
  for (const [key, at] of Object.entries(sent)) if (now.getTime() - Date.parse(at) > 2 * cooldownMs) delete sent[key];
  const fresh = alerts.filter((a) => !sent[a.key] || now.getTime() - Date.parse(sent[a.key]!) > cooldownMs);
  for (const a of fresh) {
    await chrome.notifications.create(`${district.properties.id}|${a.key}`, {
      type: 'basic',
      iconUrl: 'icons/icon-192.png',
      title: a.title[settings.lang],
      message: a.body[settings.lang],
      priority: a.severity === 'danger' ? 2 : 1,
    });
    sent[a.key] = now.toISOString();
  }
  if (fresh.length) await saveSent(sent);
}
