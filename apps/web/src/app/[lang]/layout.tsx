import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { IBM_Plex_Mono, IBM_Plex_Sans_Thai } from 'next/font/google';
import { LANGS, isLang, t } from '@hw/core/i18n';
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
  return { title: t('app.name', lang), description: t('app.tagline', lang) };
}

export const viewport: Viewport = { themeColor: '#0f1b2d' };

export default async function LangLayout({ children, params }: LayoutProps<'/[lang]'>) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return (
    <html lang={lang} className={`${plexThai.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
