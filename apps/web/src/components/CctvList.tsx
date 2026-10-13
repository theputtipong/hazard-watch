'use client';

import { DEFAULT_CONFIG, type CctvCamera } from '@hw/core';
import { t, type Lang } from '@hw/core/i18n';
import { openCamera, safeCameraUrl } from '@/lib/openCamera';

export function CctvList({ lang, cameras }: { lang: Lang; cameras: (CctvCamera & { km: number })[] }) {
  if (!cameras.length) return null;
  return (
    <section aria-labelledby="cctv-title" className="rounded-card border border-line bg-surface px-4.5 py-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cctv-title" className="text-title font-semibold">
          {t('card.cctv', lang)}
        </h2>
        <span className="text-caption text-ink-muted">{t('cctv.opening', lang)}</span>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
        {cameras.map((cam) => (
          <li key={cam.id}>
            <a
              href={safeCameraUrl(cam.viewUrl) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault();
                openCamera(cam);
              }}
              className="flex min-h-11 items-center gap-3 rounded-card border border-line p-3 hover:border-ink"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body font-medium">{cam.name[lang]}</span>
                <span className="num text-caption text-ink-muted">
                  {cam.km.toFixed(1)} {DEFAULT_CONFIG.units.distance}
                </span>
              </span>
              <span className="text-body font-semibold whitespace-nowrap text-accent">{t('cctv.viewLive', lang)} ↗</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
