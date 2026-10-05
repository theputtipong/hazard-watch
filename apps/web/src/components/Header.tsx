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
    <header className="border-b border-line bg-panel">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 flex-[1_1_280px] items-center gap-2.5">
          <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
            <rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="#0F1B2D" stroke="var(--color-line)" />
            <path d="M9 19a5 5 0 0 1 1-9.9A6 6 0 0 1 21.5 10 4.5 4.5 0 0 1 22 19z" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M12 22l-1 3M17 22l-1 3M22 22l-1 3" stroke="#7FB2FF" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <div className="flex min-w-0 flex-col">
            <strong className="text-heading leading-tight">{t('app.name', lang)}</strong>
            <span className="text-caption text-muted">
              {t('app.tagline', lang)} · {t('common.updated', lang)} <span className="num">{time}</span>
            </span>
          </div>
        </div>
        {/* One row of controls on phones too, so the header stays short. */}
        <div className="flex flex-wrap items-center gap-1.5">
        {children}
        <nav aria-label={t('common.language', lang)} className="flex gap-0.5 rounded-box bg-seg p-[3px]">
          {LANGS.map((l) => (
            <Link
              key={l}
              href={`/${l}`}
              onClick={() => setLangCookie(l)}
              aria-current={l === lang ? 'page' : undefined}
              className={`grid min-h-10 min-w-11 place-items-center rounded-control text-body font-semibold ${
                l === lang ? 'bg-panel text-ink shadow-sm' : 'text-muted'
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
