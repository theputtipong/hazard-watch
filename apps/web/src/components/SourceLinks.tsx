import { Fragment } from 'react';
import { t, type Lang } from '@hw/core/i18n';
import { dataLabel, sourceLinks } from '@/content/sources';

export function SourceLinks({ lang }: { lang: Lang }) {
  return (
    <span>
      {dataLabel[lang]}{' '}
      {sourceLinks.map((s, i) => (
        <Fragment key={s.url}>
          {i > 0 && ' · '}
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${s.name[lang]}, ${t('sources.openLink', lang)}`}
            className="text-accent underline underline-offset-4"
          >
            {s.name[lang]}
          </a>
        </Fragment>
      ))}
    </span>
  );
}
