'use client';

import { useState } from 'react';
import { t, type Lang } from '@hw/core/i18n';
import type { ThemePref } from '@/lib/prefs';

interface Props {
  lang: Lang;
  theme: ThemePref;
  cvd: boolean;
  onTheme: () => void;
  onCvd: () => void;
  speech: { supported: boolean; hasVoice: boolean; speaking: boolean };
  onListen: () => void;
}

const btn =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-chip-line bg-panel px-3 text-body font-medium text-ink-2 hover:border-ink-2';

function ThemeIcon({ theme }: { theme: ThemePref }) {
  if (theme === 'light')
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  if (theme === 'dark')
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      </svg>
    );
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
    </svg>
  );
}

/** Theme, colour-blind palette and read-aloud. Icons always carry a text label for screen readers. */
export function A11yControls({ lang, theme, cvd, onTheme, onCvd, speech, onListen }: Props) {
  const themeLabel = t('a11y.theme', lang, { mode: t(`a11y.theme.${theme}`, lang) });
  const listenLabel = speech.speaking ? t('a11y.stop', lang) : t('a11y.listen', lang);
  // Shown after the first press, so the header stays short until it matters.
  const [tried, setTried] = useState(false);
  const voiceNote = !speech.supported ? t('a11y.noSpeech', lang) : !speech.hasVoice ? t('a11y.noVoice', lang) : null;

  return (
    <div role="group" aria-label={t('a11y.display', lang)} className="contents">
      <button type="button" className={btn} onClick={onTheme} aria-label={themeLabel} title={themeLabel}>
        <ThemeIcon theme={theme} />
        <span className="hidden sm:inline">{t(`a11y.theme.${theme}`, lang)}</span>
      </button>
      <button
        type="button"
        className={`${btn} ${cvd ? 'border-ink bg-ink text-panel' : ''}`}
        onClick={onCvd}
        aria-pressed={cvd}
        aria-label={t('a11y.cvd', lang)}
        title={t('a11y.cvd', lang)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span className="hidden md:inline">{t('a11y.cvd', lang)}</span>
      </button>
      <button
        type="button"
        className={`${btn} ${speech.speaking ? 'border-accent text-accent' : ''}`}
        onClick={() => {
          setTried(true);
          onListen();
        }}
        disabled={!speech.supported}
        aria-label={listenLabel}
        title={voiceNote ?? listenLabel}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 9v6h4l5 4V5L8 9z" />
          {speech.speaking ? <path d="M17 9l4 6M21 9l-4 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
        </svg>
        <span className="hidden sm:inline">{listenLabel}</span>
      </button>
      {voiceNote && tried && (
        <div role="status" className="flex basis-full flex-col text-caption text-muted">
          <span>{voiceNote}</span>
          {/* Free fix: install the system's Thai voice (no server speech). Thai page only, as the steps are for Thai. */}
          {speech.supported && lang === 'th' && (
            <details className="text-ink-2">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-accent underline underline-offset-4">
                {t('a11y.voiceHow', lang)}
              </summary>
              <ul className="flex list-disc flex-col gap-1 pb-1 pl-5">
                <li>{t('a11y.voiceAndroid', lang)}</li>
                <li>{t('a11y.voiceWindows', lang)}</li>
                <li>{t('a11y.voiceApple', lang)}</li>
              </ul>
              <p>{t('a11y.voiceReload', lang)}</p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
