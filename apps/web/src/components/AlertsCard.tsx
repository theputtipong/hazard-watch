'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DEFAULT_CONFIG, type PushKind, type ZoneFeature } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';
import { WEB } from '@/config';
import { currentSubscription, pushSupport, savedPrefs, sendTest, subscribe, unsubscribe, type PushPrefs, type PushSupport } from '@/lib/push';
import { Card } from './Card';
import { zoneLabel } from './ZonePanel';

type Status = 'loading' | 'off' | 'on' | 'busy';

/**
 * Turn push alerts on/off for one area. The area comes from the device location (worked out on the device),
 * or from the district picked on the map when location is off.
 */
export function AlertsCard({ lang, district, subdistrict }: { lang: Lang; district: ZoneFeature | null; subdistrict: ZoneFeature | null }) {
  const [support, setSupport] = useState<PushSupport>('ok');
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<PushPrefs>({ kinds: [...DEFAULT_CONFIG.push.kinds], pm25At: DEFAULT_CONFIG.pm25.pushAt });
  const [savedArea, setSavedArea] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const s = pushSupport();
    const saved = savedPrefs();
    currentSubscription().then((sub) => {
      if (!alive) return;
      setSupport(s);
      if (saved) {
        setPrefs(saved.prefs);
        setSavedArea(saved.district);
      }
      setStatus(sub ? 'on' : 'off');
    });
    return () => {
      alive = false;
    };
  }, []);

  const area = district ? zoneLabel(district, lang) : null;
  const run = async (action: () => Promise<unknown>, done: Status, okMessage: string | null) => {
    setStatus('busy');
    setMessage(null);
    try {
      await action();
      setStatus(done);
      setMessage(okMessage);
    } catch (err) {
      setStatus(done === 'on' ? 'off' : 'on');
      setMessage(err instanceof Error && err.message === 'denied' ? t('push.denied', lang) : t('push.error', lang));
    }
  };
  const save = () =>
    run(
      () => subscribe({ lang, district: district!.properties.id, subdistrict: subdistrict?.properties.id ?? null, prefs }),
      'on',
      t('push.saved', lang),
    );
  const toggleKind = (k: PushKind) =>
    setPrefs((p) => ({ ...p, kinds: p.kinds.includes(k) ? p.kinds.filter((x) => x !== k) : [...p.kinds, k] }));

  return (
    <Card title={t('push.title', lang)}>
      {support === 'unsupported' && <p className="text-body text-muted">{t('push.unsupported', lang)}</p>}
      {support === 'ios-needs-install' && <p className="rounded-control bg-sunken px-3 py-2 text-body">{t('push.ios', lang)}</p>}
      {support === 'ok' && (
        <>
          <p className="text-body">
            {status === 'on' && savedArea && district?.properties.id === savedArea
              ? t('push.on', lang, { area: area ?? '' })
              : area
                ? t('push.intro', lang, { area })
                : t('push.pickArea', lang)}
          </p>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-caption text-muted">{t('push.kinds', lang)}</legend>
            {DEFAULT_CONFIG.push.kinds.map((k) => (
              <label key={k} className="flex min-h-11 items-center gap-2 text-body">
                <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={prefs.kinds.includes(k)} onChange={() => toggleKind(k)} />
                {t(`push.kind.${k}`, lang)}
              </label>
            ))}
          </fieldset>
          {prefs.kinds.includes('pm25') && (
            <label className="flex flex-wrap items-center gap-2 text-body">
              {t('push.pmAt', lang)}
              <select
                value={prefs.pm25At}
                onChange={(e) => setPrefs((p) => ({ ...p, pm25At: Number(e.target.value) }))}
                className="min-h-11 rounded-control border border-chip-line bg-panel px-2 text-ink"
              >
                {WEB.push.pm25Choices.map((v) => (
                  <option key={v} value={v}>
                    {v} {DEFAULT_CONFIG.units.pm25}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {status !== 'on' ? (
              <button
                type="button"
                onClick={save}
                disabled={!district || status === 'busy' || status === 'loading' || !prefs.kinds.length}
                className="min-h-11 rounded-full bg-accent px-4 text-body font-semibold text-panel disabled:opacity-50"
              >
                {t('push.enable', lang)}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={save}
                  disabled={!district || status !== 'on' || !prefs.kinds.length}
                  className="min-h-11 rounded-full bg-accent px-4 text-body font-semibold text-panel disabled:opacity-50"
                >
                  {t('push.update', lang)}
                </button>
                <button
                  type="button"
                  onClick={() => run(sendTest, 'on', null)}
                  className="min-h-11 rounded-full border border-chip-line px-4 text-body font-medium"
                >
                  {t('push.test', lang)}
                </button>
                <button
                  type="button"
                  onClick={() => run(unsubscribe, 'off', null)}
                  className="min-h-11 rounded-full border border-chip-line px-4 text-body font-medium"
                >
                  {t('push.disable', lang)}
                </button>
              </>
            )}
          </div>
          {message && (
            <p role="status" className="text-body text-muted">
              {message}
            </p>
          )}
        </>
      )}
      <Link href={`/${lang}/privacy`} className="inline-flex min-h-11 items-center text-caption text-accent underline underline-offset-4">
        {t('push.privacy', lang)}
      </Link>
    </Card>
  );
}
