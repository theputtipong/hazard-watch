import type { CctvCamera } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';

export function CctvList({ lang, cameras }: { lang: Lang; cameras: (CctvCamera & { km: number })[] }) {
  if (!cameras.length) return null;
  return (
    <section aria-labelledby="cctv-title" className="rounded-2xl border border-line bg-panel px-4.5 py-4">
      <h2 id="cctv-title" className="mb-3 text-[15px] font-semibold">
        {t('card.cctv', lang)}
      </h2>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
        {cameras.map((cam) => (
          <li key={cam.id}>
            <a
              href={cam.viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center gap-3 rounded-xl border border-[#e0e5eb] p-3 hover:border-ink-2"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{cam.name[lang]}</span>
                <span className="num text-xs text-muted">{cam.km.toFixed(1)} km</span>
              </span>
              <span className="text-[13px] font-semibold whitespace-nowrap text-accent">{t('common.viewAtSource', lang)} ↗</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
