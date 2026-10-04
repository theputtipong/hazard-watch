import type { MetadataRoute } from 'next';
import { DEFAULT_LANG, t } from '@hw/core/i18n';

/** Installable app (needed for push on iPhone: Add to Home Screen first). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${t('app.name', 'th')} · ${t('app.name', 'en')}`,
    short_name: t('app.name', DEFAULT_LANG),
    description: t('app.tagline', DEFAULT_LANG),
    start_url: `/${DEFAULT_LANG}`,
    display: 'standalone',
    background_color: '#0f1b2d',
    theme_color: '#0f1b2d',
    lang: DEFAULT_LANG,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
