import { useMemo } from 'react';
import Icon from '../components/Icon.jsx';
import { MemoryGrid } from '../components/Memories.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/States.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useComposer, useFetch, usePageTitle } from '../state.jsx';

/** Every memory on one line, grouped by year (newest first). */
export default function Timeline() {
  const { t } = useI18n();
  const { openMemory } = useComposer();
  const { data, error, retry } = useFetch('/api/memories');
  usePageTitle(t('timeline.title'));

  // The API already sorts newest → oldest, so grouping keeps that order.
  const groups = useMemo(() => {
    const byYear = new Map();
    for (const memory of data?.memories ?? []) {
      if (!byYear.has(memory.year)) byYear.set(memory.year, []);
      byYear.get(memory.year).push(memory);
    }
    return [...byYear.entries()].map(([year, memories]) => ({ year, memories }));
  }, [data]);

  return (
    <>
      <PageHeader
        kicker={t('timeline.kicker')}
        title={t('timeline.title')}
        subtitle={data ? t('timeline.sub', { count: groups.length }) : ' '}
      />
      {error && <ErrorState error={error} onRetry={retry} />}
      {!data && !error && <Skeleton height={180} count={3} />}
      {data && groups.length === 0 && (
        <EmptyState
          title={t('timeline.emptyTitle')}
          body={t('timeline.emptyBody')}
          action={
            <button type="button" className="btn btn-primary" onClick={() => openMemory()}>
              <Icon name="plus" size={15} />
              {t('timeline.emptyCta')}
            </button>
          }
        />
      )}
      {groups.length > 0 && (
        <ol className="timeline">
          {groups.map((group) => (
            <li key={group.year} className="tl-year">
              <div className="tl-label">
                <span className="tl-num">{group.year}</span>
                <span className="tl-count">{t('timeline.count', { count: group.memories.length })}</span>
              </div>
              <MemoryGrid memories={group.memories} compact />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
