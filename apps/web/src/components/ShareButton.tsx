'use client';

import { useState } from 'react';
import type { ZoneFeature, ZoneSummary } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';
import { shareContent, shareTargets } from '@/lib/share';
import { zoneLabel } from '@/lib/zoneText';

export function ShareButton({ lang, zone, summary }: { lang: Lang; zone: ZoneFeature; summary: ZoneSummary }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const content = shareContent(zone, summary, lang);
  const targets = shareTargets(content);

  const onShare = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(content);
        return;
      } catch (err) {
        // AbortError = user cancelled; any other failure falls back to the menu.
        if ((err as Error).name === 'AbortError') return;
      }
    }
    setOpen((o) => !o);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${content.text}\n${content.url}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t('share.copy', lang), content.url);
    }
  };

  const item = 'inline-flex min-h-11 items-center rounded-full border border-line-control bg-surface px-4 text-body font-medium';
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onShare}
        aria-expanded={open}
        aria-label={t('share.label', lang, { area: zoneLabel(zone, lang) })}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-control bg-surface px-4 text-body font-semibold"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="18" cy="5" r="2.5" />
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="19" r="2.5" />
          <path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" />
        </svg>
        {t('share.button', lang)}
      </button>
      {open && (
        <div role="group" aria-label={t('share.label', lang, { area: zoneLabel(zone, lang) })} className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={copy} className={item}>
            {copied ? t('share.copied', lang) : t('share.copy', lang)}
          </button>
          <a href={targets.line} target="_blank" rel="noopener noreferrer" className={item}>
            {t('share.line', lang)}
          </a>
          <a href={targets.facebook} target="_blank" rel="noopener noreferrer" className={item}>
            {t('share.facebook', lang)}
          </a>
          <a href={targets.x} target="_blank" rel="noopener noreferrer" className={item}>
            {t('share.x', lang)}
          </a>
          <span role="status" className="sr-only">
            {copied ? t('share.copied', lang) : ''}
          </span>
        </div>
      )}
    </div>
  );
}
