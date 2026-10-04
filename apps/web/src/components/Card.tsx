import type { ReactNode } from 'react';

export function Card({ title, status, children, source, id }: { title: string; status?: ReactNode; children: ReactNode; source?: string; id?: string }) {
  return (
    <article id={id} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-panel px-4.5 py-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {status}
      </div>
      {children}
      {source && <p className="text-[11px] text-muted">{source}</p>}
    </article>
  );
}
