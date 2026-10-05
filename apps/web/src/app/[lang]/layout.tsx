import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { IBM_Plex_Mono, IBM_Plex_Sans_Thai } from 'next/font/google';
import { LANGS, isLang, t } from '@hw/core/i18n';
import { WEB } from '@/config';
import { PREFS_SCRIPT } from '@/lib/prefsScript';
import '../globals.css';

const plexThai = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-thai',
});
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-plex-mono' });

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const title = t('app.name', lang);
  const description = t('app.tagline', lang);
  // Link previews (LINE, Facebook, X): title, short description and the app icon.
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
      images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: title }],
    },
    twitter: { card: 'summary', title, description, images: ['/icons/icon-512.png'] },
  };
}

export const viewport: Viewport = { themeColor: '#0f1b2d' };

export default async function LangLayout({ children, params }: LayoutProps<'/[lang]'>) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return (
    // data-theme/data-cvd are set by the inline script before paint, so the server value may differ.
    <html lang={lang} className={`${plexThai.variable} ${plexMono.variable}`} data-theme="light" data-cvd="off" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
