import { useI18n } from '../i18n/index.jsx';
import Icon from './Icon.jsx';

const isWebLink = (url) => /^https?:\/\//i.test(url ?? '');

/** A film or song from the family archive: a cassette in the notebook, a record in the darkroom. */
export default function Reel({ item, index = 0, onEdit }) {
  const { t } = useI18n();
  // Defence in depth: only ever link to http(s); otherwise search YouTube for the title.
  const href = isWebLink(item.url)
    ? item.url
    : `https://www.youtube.com/results?search_query=${encodeURIComponent(item.title)}`;
  const meta = [t(`archive.kind.${item.kind}`), item.owner, item.era].filter(Boolean).join(' · ');

  return (
    <article className="reel">
      <div className={`disc d${(index % 3) + 1}`} aria-hidden="true" />
      <div className="reel-body">
        <h3 className="reel-title">{item.title}</h3>
        <span className="reel-meta">{meta}</span>
        {item.story && <p className="reel-story private text">{item.story}</p>}
        <div className="reel-actions">
          <a
            className="btn btn-secondary btn-sm"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={isWebLink(item.url) ? undefined : t('archive.searchHint')}
          >
            <Icon name={item.kind === 'film' ? 'film' : 'music'} size={14} />
            {item.kind === 'film' ? t('archive.watch') : t('archive.listen')}
          </a>
          {onEdit && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => onEdit(item)}>
              {t('common.edit')}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
