import { useId } from 'react';
import { fieldMessage, useI18n } from '../i18n/index.jsx';

/**
 * Label + control + hint + error, wired together for screen readers.
 * `children` is a function receiving the props the control needs:
 *   <Field label="Title" error={errors.title}>{(p) => <input className="input" {...p} />}</Field>
 */
export default function Field({ label, hint, error, optional = false, children }) {
  const { t } = useI18n();
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label className="field-label" htmlFor={id}>
        <span>{label}</span>
        {optional && <span className="optional">{t('common.optional')}</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error && (
        <span className="field-error" id={errorId}>
          {fieldMessage(t, error)}
        </span>
      )}
      {hint && !error && (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      )}
    </div>
  );
}
