import { notFound } from 'next/navigation';
import { isLang } from '@hw/core/i18n';
import { Dashboard } from '@/components/Dashboard';

export default async function Page({ params }: PageProps<'/[lang]'>) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return <Dashboard lang={lang} />;
}
