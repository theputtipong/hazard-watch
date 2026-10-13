import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { IBM_Plex_Sans_Thai } from 'next/font/google';
import { LANGS, isLang, t } from '@hw/core/i18n';
import { WEB } from '@/config';
import { PREFS_SCRIPT } from '@/lib/prefsScript';
import '../globals.css';

const plexThai = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-thai',
});

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const title = t('app.name', lang);
  const description = t('app.tagline', lang);
  const image = { url: `/og/og-${lang}.png`, width: 1200, height: 630, alt: `${title} · ${description}` };
  return {
    metadataBase: new URL(WEB.siteUrl),
    title,
    description,
    alternates: { languages: { th: '/th', en: '/en' } },
    openGraph: {
      type: 'website',
      siteName: title,
      title,
      description,
      locale: lang === 'th' ? 'th_TH' : 'en_US',
      url: `/${lang}`,
      images: [image],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export const viewport: Viewport = { themeColor: '#0f1b2e' };

export default async function LangLayout({ children, params }: LayoutProps<'/[lang]'>) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return (
    // data-theme/data-cvd are set by the inline script before paint, so they may differ from the server.
    <html lang={lang} className={plexThai.variable} data-theme="light" data-cvd="off" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
