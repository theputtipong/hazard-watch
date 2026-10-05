'use client';

import { createContext, useContext } from 'react';
import { t, type Lang } from '@hw/core/i18n';

/** Whether the first snapshot is still loading, arrived, or could not be fetched at all. */
export type LoadState = 'loading' | 'ready' | 'error';

export const LoadStateContext = createContext<LoadState>('ready');

/** "No data" that tells the truth: while loading it says so instead of implying the source is empty. */
export function NoData({ lang }: { lang: Lang }) {
  const state = useContext(LoadStateContext);
  return (
    <p className="text-sm text-muted" aria-live="polite">
      {state === 'loading' ? t('common.loading', lang) : t('common.noData', lang)}
    </p>
  );
}
