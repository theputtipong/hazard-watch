import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isBangkokZone } from '@hw/core';
import { isLang, t, type Lang, type MessageKey } from '@hw/core/i18n';
import { Dashboard } from '@/components/Dashboard';
// id → [Thai name, English name], built by tools/boundaries/build.py (small; the polygons stay client-side).
import names from '../../../public/geo/names.json';

const NAMES = names as unknown as Record<string, [string, string]>;
const AREA_ID = /^TH\d{2}(\d{2}(\d{2})?)?$/;

/** Name of one area level with its Thai prefix (เขต/แขวง in Bangkok, อำเภอ/ตำบล elsewhere). */
function label(id: string, lang: Lang): string {
  const [th, en] = NAMES[id]!;
  if (lang === 'en') return en;
  const level = id.length === 6 ? 2 : id.length === 8 ? 3 : 1;
  const prefix = level > 1 ? t(`zone.prefix${level}${isBangkokZone(id) ? '.bkk' : ''}` as MessageKey, 'th') : '';
  return `${prefix}${th}`;
}

/** "แขวงทุ่งมหาเมฆ เขตสาทร" / "Thung Mahamek, Sathon" for an id from a shared link, or null if unknown. */
function areaName(id: string | undefined, lang: Lang): string | null {
  if (!id || !AREA_ID.test(id) || !NAMES[id]) return null;
  const district = id.length === 8 ? id.slice(0, 6) : null;
  if (!district || !NAMES[district]) return label(id, lang);
  return lang === 'th' ? `${label(id, lang)} ${label(district, lang)}` : `${label(id, lang)}, ${label(district, lang)}`;
}

const areaParam = (sp: Record<string, string | string[] | undefined>) => (typeof sp.area === 'string' ? sp.area : undefined);

/** Shared area links get their own preview title and description (LINE, Facebook, X). */
export async function generateMetadata({ params, searchParams }: PageProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const id = areaParam(await searchParams);
  const area = areaName(id, lang);
  if (!area) return {};
  const title = t('share.metaTitle', lang, { area, app: t('app.name', lang) });
  const description = t('share.metaDescription', lang, { area });
  // openGraph/twitter here replace the layout's objects entirely, so the image is repeated.
  const images = [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: title }];
  return {
    title,
    description,
    openGraph: { type: 'website', title, description, url: `/${lang}?area=${id}`, images },
    twitter: { card: 'summary', title, description, images: ['/icons/icon-512.png'] },
  };
}

export default async function Page({ params, searchParams }: PageProps<'/[lang]'>) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const id = areaParam(await searchParams);
  return <Dashboard lang={lang} initialArea={id && AREA_ID.test(id) && NAMES[id] ? id : null} />;
}
