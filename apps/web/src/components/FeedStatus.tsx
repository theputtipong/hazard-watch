import { feedAgeText, feedStatuses, type DashboardSnapshot, type FeedStatus as Feed } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';

/** Freshness by shape, never by severity colour (severity colours mean risk only). */
function Mark({ state }: { state: Feed['state'] }) {
  if (state === 'live') return <span className="size-2 justify-self-center rounded-full bg-ink-muted" aria-hidden="true" />;
  if (state === 'stale') return <span className="size-2 justify-self-center rounded-full border-2 border-ink-muted" aria-hidden="true" />;
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" className="justify-self-center text-ink" aria-hidden="true">
      <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function FeedStatus({ lang, snapshot }: { lang: Lang; snapshot: DashboardSnapshot }) {
  const now = new Date();
  const feeds = feedStatuses(snapshot, now);
  if (!feeds.length) return null;
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-raised sm:p-5">
      <h2 className="mb-2 text-label text-ink-muted">{t('feeds.title', lang)}</h2>
      <ul>
        {feeds.map((f) => (
          <li key={f.topic} className="grid grid-cols-[16px_max-content_1fr] items-center gap-2 border-t border-line py-2 text-label first:border-t-0">
            <Mark state={f.state} />
            <span>{t(`feeds.name.${f.topic}`, lang)}</span>
            <span className={`num text-right text-caption font-normal ${f.state === 'down' ? 'text-ink' : 'text-ink-muted'}`}>{feedAgeText(f, lang, now)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
