import Link from 'next/link';
import { headers } from 'next/headers';
import { DEFAULT_LANG, isLang, t } from '@hw/core/i18n';

export default async function NotFound() {
  // not-found pages don't receive params; read the language from the path the proxy kept.
  const path = (await headers()).get('x-pathname') ?? '';
  const first = path.split('/')[1];
  const lang = isLang(first) ? first : DEFAULT_LANG;
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-[560px] flex-col items-start justify-center gap-4 px-4 py-12">
      <p className="num text-figure text-muted">404</p>
      <h1 className="text-display font-bold">{t('notFound.title', lang)}</h1>
      <p className="text-muted">{t('notFound.body', lang)}</p>
      <Link href={`/${lang}`} className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-semibold text-panel">
        {t('common.home', lang)}
      </Link>
    </main>
  );
}
