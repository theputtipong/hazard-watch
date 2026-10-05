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
    <article id={id} className="flex flex-col gap-2.5 rounded-card border border-line bg-panel px-4.5 py-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-title font-semibold">{title}</h2>
        {status}
      </div>
      {children}
      {note && <p className="rounded-control bg-watch px-2.5 py-1.5 text-caption text-watch-strong">{note}</p>}
      {source && <p className="text-caption text-muted">{source}</p>}
    </article>
  );
}
