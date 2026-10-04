'use client';

import Link from 'next/link';
import { LANGS, t, type Lang } from '@hw/core/i18n';

function setLangCookie(lang: Lang) {
  document.cookie = `lang=${lang}; path=/; max-age=31536000; samesite=lax`;
}

export function Header({ lang, updatedAt }: { lang: Lang; updatedAt: string | null }) {
  const time = updatedAt
    ? new Date(updatedAt).toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })
    : '—';
  return (
    <header className="border-b border-line bg-panel">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-4 px-4 py-3 sm:px-6">
        <div className="flex flex-auto items-center gap-2.5">
          <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#0F1B2D" />
            <path d="M9 19a5 5 0 0 1 1-9.9A6 6 0 0 1 21.5 10 4.5 4.5 0 0 1 22 19z" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M12 22l-1 3M17 22l-1 3M22 22l-1 3" stroke="#7FB2FF" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <div className="flex flex-col">
            <strong className="text-lg leading-tight">{t('app.name', lang)}</strong>
            <span className="text-xs text-muted">{t('app.tagline', lang)}</span>
          </div>
        </div>
        <span className="text-[13px] text-muted">
          {t('common.updated', lang)} <span className="num">{time}</span>
        </span>
        <nav aria-label={t('common.language', lang)} className="flex gap-0.5 rounded-[10px] bg-[#e8ecf1] p-[3px]">
          {LANGS.map((l) => (
            <Link
              key={l}
              href={`/${l}`}
              onClick={() => setLangCookie(l)}
              aria-current={l === lang ? 'page' : undefined}
              className={`grid min-h-9 min-w-11 place-items-center rounded-lg text-[13px] font-semibold ${
                l === lang ? 'bg-panel text-ink shadow-sm' : 'text-muted'
              }`}
            >
              {l.toUpperCase()}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
