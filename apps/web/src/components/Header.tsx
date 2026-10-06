'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { LANGS, t, type Lang } from '@hw/core/i18n';
import { WEB } from '@/config';

function setLangCookie(lang: Lang) {
  document.cookie = `lang=${lang}; path=/; max-age=${WEB.langCookieDays * 86_400}; samesite=lax`;
}

export function Header({ lang, updatedAt, children }: { lang: Lang; updatedAt: string | null; children?: ReactNode }) {
  const time = updatedAt
    ? new Date(updatedAt).toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })
    : '—';
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 flex-[1_1_280px] items-center gap-2.5">
          {/* Design system icon, fixed colours in both themes; the small variant (no rain lines) is for 32px and below. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/hazardwatch-icon-small.svg" width={32} height={32} alt="" className="shrink-0" />
          <div className="flex min-w-0 flex-col">
            <strong className="text-title leading-tight">{t('app.name', lang)}</strong>
            <span className="text-caption text-ink-muted">
              {t('app.tagline', lang)} · {t('common.updated', lang)} <span className="num">{time}</span>
            </span>
          </div>
        </div>
        {/* One row of controls on phones too, so the header stays short. */}
        <div className="flex flex-wrap items-center gap-1.5">
        {children}
        <nav aria-label={t('common.language', lang)} className="flex gap-0.5 rounded-control bg-surface-sunken p-[3px]">
          {LANGS.map((l) => (
            <Link
              key={l}
              href={`/${l}`}
              onClick={() => setLangCookie(l)}
              aria-current={l === lang ? 'page' : undefined}
              className={`grid min-h-10 min-w-11 place-items-center rounded-small text-label ${
                l === lang ? 'bg-surface text-ink shadow-raised outline outline-1 outline-line' : 'text-ink-muted'
              }`}
            >
              {l.toUpperCase()}
            </Link>
          ))}
        </nav>
        </div>
      </div>
    </header>
  );
}
