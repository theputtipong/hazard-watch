import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLang, t } from '@hw/core/i18n';
import { privacy } from '@/content/privacy';

export default async function PrivacyPage({ params }: PageProps<'/[lang]/privacy'>) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const doc = privacy[lang];
  return (
    <main className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/${lang}`} className="inline-flex min-h-11 items-center text-body text-accent underline underline-offset-4">
          ‹ {t('common.home', lang)}
        </Link>
        <Link
          href={`/${lang === 'th' ? 'en' : 'th'}/privacy`}
          className="inline-flex min-h-11 items-center rounded-full border border-chip-line px-4 text-body font-semibold"
        >
          {lang === 'th' ? 'English' : 'ภาษาไทย'}
        </Link>
      </div>
      <header className="flex flex-col gap-1">
        <h1 className="text-display font-bold">
          {t('privacy.title', lang)} · {t('app.name', lang)}
        </h1>
        <p className="text-body text-muted">{doc.updated}</p>
      </header>
      {doc.sections.map((s) => (
        <section key={s.heading} className="flex flex-col gap-2">
          <h2 className="text-heading font-semibold">{s.heading}</h2>
          <ul className="list-disc space-y-1 pl-5 leading-relaxed">
            {s.body.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
