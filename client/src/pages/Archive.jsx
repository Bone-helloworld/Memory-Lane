import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { Segmented } from '../components/Controls.jsx';
import MediaForm from '../components/forms/MediaForm.jsx';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Reel from '../components/Reel.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/States.jsx';
import { useToast } from '../components/Toast.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useData, useFetch, usePageTitle } from '../state.jsx';

/** "Kho phim & nhạc" — the family's films and songs: cassettes in the notebook, records in the darkroom. */
export default function Archive() {
  const { t } = useI18n();
  const { refresh } = useData();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const kind = ['film', 'music'].includes(params.get('kind')) ? params.get('kind') : '';
  const { data, error, retry } = useFetch(`/api/media${kind ? `?kind=${kind}` : ''}`);
  const [form, setForm] = useState(null); // null | { item } (item null → new)
  const [deleting, setDeleting] = useState(null);
  usePageTitle(t('archive.title'));

  useEffect(() => {
    if (params.get('new') === '1') {
      setForm({ item: null });
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const items = data?.media;

  function onSaved() {
    setForm(null);
    toast(t('archive.form.saved'));
    refresh();
  }

  async function remove() {
    await api.del(`/api/media/${deleting.id}`);
    setDeleting(null);
    toast(t('archive.form.deleted'));
    refresh();
  }

  return (
    <>
      <PageHeader
        kicker={t('archive.eyebrow')}
        title={t('archive.title')}
        subtitle={items ? t('archive.count', { count: items.length }) : ' '}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setForm({ item: null })}>
            <Icon name="plus" size={15} />
            {t('archive.add')}
          </button>
        }
      />

      <div className="toolbar">
        <p className="lede">{t('archive.lede')}</p>
        <Segmented
          label={t('archive.title')}
          value={kind}
          onChange={(value) => setParams(value ? { kind: value } : {})}
          options={[
            { value: '', label: t('archive.filter.all') },
            { value: 'film', label: t('archive.filter.film'), icon: 'film' },
            { value: 'music', label: t('archive.filter.music'), icon: 'music' },
          ]}
        />
      </div>

      {error && <ErrorState error={error} onRetry={retry} />}
      {!items && !error && (
        <div className="reels">
          <Skeleton height={130} />
          <Skeleton height={130} />
          <Skeleton height={130} />
        </div>
      )}
      {items?.length === 0 && (
        <EmptyState
          art="disc"
          title={t('archive.emptyTitle')}
          body={t('archive.emptyBody')}
          action={
            <button type="button" className="btn btn-primary" onClick={() => setForm({ item: null })}>
              {t('archive.emptyCta')}
            </button>
          }
        />
      )}
      {items?.length > 0 && (
        <div className="reels">
          {items.map((item, index) => (
            <Reel key={item.id} item={item} index={index} onEdit={(selected) => setForm({ item: selected })} />
          ))}
        </div>
      )}

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.item ? t('archive.form.editTitle', { title: form.item.title }) : t('archive.form.newTitle')}
        kicker={t('archive.form.eyebrow')}
      >
        <MediaForm
          item={form?.item}
          onSaved={onSaved}
          onCancel={() => setForm(null)}
          onDelete={() => {
            setDeleting(form.item);
            setForm(null);
          }}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('archive.form.confirmTitle', { title: deleting?.title ?? '' })}
        body={t('archive.form.confirmBody')}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
