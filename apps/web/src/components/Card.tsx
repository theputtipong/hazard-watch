import type { ReactNode } from 'react';

export function Card({
  title,
  status,
  children,
  source,
  note,
  id,
}: {
  title: string;
  status?: ReactNode;
  children: ReactNode;
  source?: string;
  /** Warning about data age (see lib/freshness.ts); shown above the source line. */
  note?: string;
  id?: string;
}) {
  return (
    <article id={id} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-raised sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title">{title}</h2>
        {status}
      </div>
      {children}
      {/* Data age is system status, not risk: neutral tones, never sev-* colours. */}
      {note && <p className="rounded-control bg-surface-sunken px-2.5 py-1.5 text-label text-ink">{note}</p>}
      {source && <p className="text-caption text-ink-muted">{source}</p>}
    </article>
  );
}
