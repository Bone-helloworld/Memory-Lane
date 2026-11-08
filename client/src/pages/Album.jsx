import { useSearchParams } from 'react-router';
import Icon from '../components/Icon.jsx';
import { MemoryGrid, YearBar } from '../components/Memories.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { EmptyState, ErrorState } from '../components/States.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useComposer, useFetch, usePageTitle } from '../state.jsx';

/** Every memory you own: prints in the notebook, a contact sheet in the darkroom. */
export default function Album() {
  const { t } = useI18n();
  const { openMemory } = useComposer();
  const [params, setParams] = useSearchParams();
  const year = params.get('year') ?? '';
  const years = useFetch('/api/memories/years');
  const list = useFetch(`/api/memories${year ? `?year=${encodeURIComponent(year)}` : ''}`);
  usePageTitle(t('album.title'));

  const total = years.data?.years.reduce((sum, entry) => sum + entry.count, 0);
  const memories = list.data?.memories;

  return (
    <>
      <PageHeader
        kicker={t('album.kicker')}
        title={t('album.title')}
        subtitle={total === undefined ? ' ' : t('album.count', { count: total })}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => openMemory()}>
            <Icon name="plus" size={15} />
            {t('nav.newMemory')}
          </button>
        }
      />

      {years.data?.years.length > 0 && (
        <div style={{ marginBottom: 36 }}>
          <YearBar years={years.data.years} active={year} onSelect={(value) => setParams(value ? { year: value } : {})} />
        </div>
      )}

      {list.error && <ErrorState error={list.error} onRetry={list.retry} />}

      {!memories && !list.error && (
        <div className="prints" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="skeleton" style={{ height: 280 }} />
          ))}
        </div>
      )}

      {memories?.length === 0 &&
        (year ? (
          <EmptyState compact title={t('album.emptyFilterTitle')} body={t('album.emptyFilterBody')} />
        ) : (
          <EmptyState
            title={t('album.emptyTitle')}
            body={t('album.emptyBody')}
            action={
              <button type="button" className="btn btn-primary" onClick={() => openMemory()}>
                <Icon name="plus" size={15} />
                {t('album.emptyCta')}
              </button>
            }
          />
        ))}

      {memories?.length > 0 && <MemoryGrid memories={memories} />}
    </>
  );
}
