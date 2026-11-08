import { useState } from 'react';
import { LIMITS } from '@shared/limits.js';
import { ApiError, api, errorMessage } from '../../api.js';
import { fieldMessage, useI18n } from '../../i18n/index.jsx';
import { Segmented, SubmitButton } from '../Controls.jsx';
import Field from '../Field.jsx';
import Icon from '../Icon.jsx';

export default function MediaForm({ item, onSaved, onCancel, onDelete }) {
  const { t } = useI18n();
  const editing = Boolean(item);
  const [values, setValues] = useState({
    kind: item?.kind ?? 'film',
    title: item?.title ?? '',
    owner: item?.owner ?? '',
    era: item?.era ?? '',
    url: item?.url ?? '',
    story: item?.story ?? '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const update = (name, value) => setValues((current) => ({ ...current, [name]: value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      const result = editing ? await api.put(`/api/media/${item.id}`, values) : await api.post('/api/media', values);
      onSaved(result.item);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION') setErrors(err.fields);
      else setFormError(errorMessage(t, err));
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      {formError && (
        <div className="form-error" role="alert">
          {formError}
        </div>
      )}
      <div className="field">
        <span className="field-label">{t('archive.form.kind')}</span>
        <div>
          <Segmented
            label={t('archive.form.kind')}
            value={values.kind}
            onChange={(kind) => update('kind', kind)}
            options={[
              { value: 'film', label: t('archive.kind.film'), icon: 'film' },
              { value: 'music', label: t('archive.kind.music'), icon: 'music' },
            ]}
          />
        </div>
        {errors.kind && <span className="field-error">{fieldMessage(t, errors.kind)}</span>}
      </div>

      <Field label={t('archive.form.title')} error={errors.title}>
        {(props) => (
          <input
            {...props}
            className="input"
            value={values.title}
            onChange={(event) => update('title', event.target.value)}
            placeholder={t('archive.form.titlePlaceholder')}
            maxLength={LIMITS.mediaTitle}
            data-autofocus
            required
          />
        )}
      </Field>

      <div className="form-split">
        <Field label={t('archive.form.owner')} error={errors.owner} optional>
          {(props) => (
            <input
              {...props}
              className="input"
              value={values.owner}
              onChange={(event) => update('owner', event.target.value)}
              placeholder={t('archive.form.ownerPlaceholder')}
              maxLength={LIMITS.mediaOwner}
            />
          )}
        </Field>
        <Field label={t('archive.form.era')} error={errors.era} optional>
          {(props) => (
            <input
              {...props}
              className="input"
              value={values.era}
              onChange={(event) => update('era', event.target.value)}
              placeholder={t('archive.form.eraPlaceholder')}
              maxLength={LIMITS.mediaEra}
            />
          )}
        </Field>
      </div>

      <Field label={t('archive.form.url')} error={errors.url} hint={t('archive.form.urlHint')} optional>
        {(props) => (
          <input
            {...props}
            className="input"
            type="url"
            inputMode="url"
            value={values.url}
            onChange={(event) => update('url', event.target.value)}
            placeholder={t('archive.form.urlPlaceholder')}
            maxLength={LIMITS.mediaUrl}
          />
        )}
      </Field>

      <Field label={t('archive.form.story')} error={errors.story} optional>
        {(props) => (
          <textarea
            {...props}
            className="textarea"
            rows={4}
            value={values.story}
            onChange={(event) => update('story', event.target.value)}
            placeholder={t('archive.form.storyPlaceholder')}
            maxLength={LIMITS.mediaStory}
          />
        )}
      </Field>

      <div className="form-actions">
        {editing && onDelete && (
          <button type="button" className="btn btn-danger-quiet grow" onClick={onDelete} disabled={saving}>
            <Icon name="trash" size={15} />
            {t('common.delete')}
          </button>
        )}
        <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={saving}>
          {t('common.cancel')}
        </button>
        <SubmitButton busy={saving}>{t('common.save')}</SubmitButton>
      </div>
    </form>
  );
}
