'use client';

import { createContext, useContext } from 'react';
import { t, type Lang } from '@hw/core/i18n';

export type LoadState = 'loading' | 'ready' | 'error';

export const LoadStateContext = createContext<LoadState>('ready');

/** While loading, says so instead of implying the source is empty. */
export function NoData({ lang }: { lang: Lang }) {
  const state = useContext(LoadStateContext);
  return (
    <p className="text-sm text-ink-muted" aria-live="polite">
      {state === 'loading' ? t('common.loading', lang) : t('common.noData', lang)}
    </p>
  );
}
