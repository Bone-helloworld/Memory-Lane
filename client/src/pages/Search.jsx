import { useSearchParams } from 'react-router';
import { Link } from 'react-router';
import Icon from '../components/Icon.jsx';
import { MemoryGrid } from '../components/Memories.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { PersonRow } from '../components/People.jsx';
import Reel from '../components/Reel.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/States.jsx';
import { SearchBox } from '../components/TopBar.jsx';
import { useI18n } from '../i18n/index.jsx';
import { ARTIFACT_ICONS } from '../lib/artifacts.js';
import { useFetch, usePageTitle } from '../state.jsx';

/** One search box for everything; accents optional ("da lat" → "Đà Lạt"). */
export default function Search() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const { data, error, retry } = useFetch(q ? `/api/search?q=${encodeURIComponent(q)}` : null);
  usePageTitle(t('search.title'));

  const total = data ? data.memories.length + data.people.length + data.media.length + data.artifacts.length : 0;

  return (
    <>
      <PageHeader
        kicker={t('search.label')}
        title={q ? t('search.resultsFor', { q }) : t('search.title')}
        subtitle={data ? t('search.count', { count: total }) : ' '}
      />

      {!q && (
        <EmptyState
          art="search"
          title={t('search.title')}
          body={t('search.prompt')}
          action={<SearchBox key="page-search" />}
        />
      )}
      {error && <ErrorState error={error} onRetry={retry} />}
      {q && !data && !error && <Skeleton height={120} count={2} />}
      {data && total === 0 && (
        <EmptyState art="search" compact title={t('search.emptyTitle', { q })} body={t('search.emptyBody')} />
      )}

      {data?.memories.length > 0 && (
        <section className="result-group">
          <h2 className="result-head">
            {t('search.memories')} <span>{data.memories.length}</span>
          </h2>
          <MemoryGrid memories={data.memories} compact />
        </section>
      )}
      {data?.people.length > 0 && (
        <section className="result-group">
          <h2 className="result-head">
            {t('search.people')} <span>{data.people.length}</span>
          </h2>
          <div className="people-list">
            {data.people.map((person) => (
              <PersonRow key={person.id} person={person} />
            ))}
          </div>
        </section>
      )}
      {data?.media.length > 0 && (
        <section className="result-group">
          <h2 className="result-head">
            {t('search.media')} <span>{data.media.length}</span>
          </h2>
          <div className="reels">
            {data.media.map((item, index) => (
              <Reel key={item.id} item={item} index={index} />
            ))}
          </div>
        </section>
      )}
      {data?.artifacts.length > 0 && (
        <section className="result-group">
          <h2 className="result-head">
            {t('search.artifacts')} <span>{data.artifacts.length}</span>
          </h2>
          <div className="chips">
            {data.artifacts.map((artifact) => (
              <Link key={artifact.id} to={`/artifacts?open=${artifact.id}`} className="chip">
                <Icon name={ARTIFACT_ICONS[artifact.kind]} size={15} />
                {artifact.title}
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
