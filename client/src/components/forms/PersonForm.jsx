import { useId, useState } from 'react';
import { LIMITS } from '@shared/limits.js';
import { toISODate } from '@shared/dates.js';
import { ApiError, api, errorMessage } from '../../api.js';
import { useI18n } from '../../i18n/index.jsx';
import { ClosenessPicker, ColorPicker, SubmitButton } from '../Controls.jsx';
import Field from '../Field.jsx';

export default function PersonForm({ person, onSaved, onCancel }) {
  const { t } = useI18n();
  const editing = Boolean(person);
  const closenessLabel = useId();
  const colorLabel = useId();
  const [values, setValues] = useState({
    name: person?.name ?? '',
    relation: person?.relation ?? '',
    lastContact: person?.lastContact ?? '',
    closeness: person?.closeness ?? 3,
    color: person?.color ?? 'teal',
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
      const body = { ...values, lastContact: values.lastContact || null };
      const result = editing ? await api.put(`/api/people/${person.id}`, body) : await api.post('/api/people', body);
      onSaved(result.person);
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
      <div className="form-split">
        <Field label={t('person.name')} error={errors.name}>
          {(props) => (
            <input
              {...props}
              className="input"
              value={values.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder={t('person.namePlaceholder')}
              maxLength={LIMITS.personName}
              autoComplete="off"
              data-autofocus
              required
            />
          )}
        </Field>
        <Field label={t('person.relation')} error={errors.relation} optional>
          {(props) => (
            <input
              {...props}
              className="input"
              value={values.relation}
              onChange={(event) => update('relation', event.target.value)}
              placeholder={t('person.relationPlaceholder')}
              maxLength={LIMITS.personRelation}
              autoComplete="off"
            />
          )}
        </Field>
      </div>

      <Field label={t('person.lastContact')} error={errors.lastContact} hint={t('person.lastContactHint')} optional>
        {(props) => (
          <input
            {...props}
            className="input"
            type="date"
            max={toISODate()}
            value={values.lastContact}
            onChange={(event) => update('lastContact', event.target.value)}
          />
        )}
      </Field>

      <div className="form-split">
        <div className="field">
          <span className="field-label" id={closenessLabel}>
            {t('person.closeness')}
          </span>
          <ClosenessPicker
            value={values.closeness}
            onChange={(value) => update('closeness', value)}
            labelledBy={closenessLabel}
          />
        </div>
        <div className="field">
          <span className="field-label" id={colorLabel}>
            {t('person.color')}
          </span>
          <ColorPicker value={values.color} onChange={(value) => update('color', value)} labelledBy={colorLabel} />
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={saving}>
          {t('common.cancel')}
        </button>
        <SubmitButton busy={saving}>{t('common.save')}</SubmitButton>
      </div>
    </form>
  );
}
