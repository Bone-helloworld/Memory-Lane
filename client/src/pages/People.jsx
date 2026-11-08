import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import PersonForm from '../components/forms/PersonForm.jsx';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { PersonRow } from '../components/People.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/States.jsx';
import { useToast } from '../components/Toast.jsx';
import { useI18n } from '../i18n/index.jsx';
import { sortPeople } from '../lib/people.js';
import { useData, useFetch, usePageTitle } from '../state.jsx';

/** "Người quen cũ" — people followed on purpose, longest silence first. */
export default function People() {
  const { t } = useI18n();
  const { refresh } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [sort, setSort] = useState('longest');
  const [formOpen, setFormOpen] = useState(false);
  const { data, error, retry } = useFetch('/api/people');
  usePageTitle(t('people.title'));

  // "add someone →" on Today links to /people?new=1.
  useEffect(() => {
    if (params.get('new') === '1') {
      setFormOpen(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const people = data ? sortPeople(data.people, sort) : null;

  function onSaved(person) {
    setFormOpen(false);
    toast(t('person.saved'));
    refresh();
    navigate(`/people/${person.id}`);
  }

  return (
    <>
      <PageHeader
        kicker={t('people.eyebrow')}
        title={t('people.title')}
        subtitle={data ? t('people.count', { count: data.people.length }) : ' '}
        actions={
          <>
            <label className="visually-hidden" htmlFor="people-sort">
              {t('people.sortLabel')}
            </label>
            <select
              id="people-sort"
              className="select"
              style={{ minHeight: 42, width: 'auto' }}
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="longest">{t('people.sort.longest')}</option>
              <option value="name">{t('people.sort.name')}</option>
              <option value="recent">{t('people.sort.recent')}</option>
            </select>
            <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
              <Icon name="plus" size={15} />
              {t('people.add')}
            </button>
          </>
        }
      />
      <p className="lede" style={{ marginTop: -16, marginBottom: 30 }}>
        {t('people.lede')}
      </p>

      {error && <ErrorState error={error} onRetry={retry} />}
      {!people && !error && <Skeleton height={76} count={4} />}
      {people?.length === 0 && (
        <EmptyState
          art="people"
          title={t('people.emptyTitle')}
          body={t('people.emptyBody')}
          action={
            <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
              {t('people.emptyCta')}
            </button>
          }
        />
      )}
      {people?.length > 0 && (
        <div className="people-list">
          {people.map((person) => (
            <PersonRow key={person.id} person={person} />
          ))}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={t('person.newTitle')} kicker={t('person.eyebrow')}>
        <PersonForm onSaved={onSaved} onCancel={() => setFormOpen(false)} />
      </Modal>
    </>
  );
}
