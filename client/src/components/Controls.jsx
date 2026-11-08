import { useState } from 'react';
import { PERSON_COLORS } from '@shared/limits.js';
import { useI18n } from '../i18n/index.jsx';
import Icon from './Icon.jsx';

/** Password input with a show/hide button. */
export function PasswordInput(props) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-wrap">
      <input className="input" type={visible ? 'text' : 'password'} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
        aria-pressed={visible}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} />
      </button>
    </div>
  );
}

/** Pick 1–5, drawn as the same dots used in the people list. */
export function ClosenessPicker({ value, onChange, labelledBy }) {
  const { t } = useI18n();
  return (
    <div className="dot-picker" role="radiogroup" aria-labelledby={labelledBy}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t('people.closeness', { value: n })}
          className={n <= value ? 'on' : undefined}
          onClick={() => onChange(n)}
        />
      ))}
    </div>
  );
}

export function ColorPicker({ value, onChange, labelledBy }) {
  const { t } = useI18n();
  return (
    <div className="swatches" role="radiogroup" aria-labelledby={labelledBy}>
      {PERSON_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={t(`person.colors.${color}`)}
          title={t(`person.colors.${color}`)}
          className={`swatch ${color}`}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}

/** Pill-shaped single choice (film / music, filters). */
export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon && <Icon name={option.icon} size={14} />}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Submit button with a spinner. busyLabel defaults to "Saving…"; pass the normal label to keep it. */
export function SubmitButton({ busy, disabled = false, busyLabel, children, className = 'btn btn-primary' }) {
  const { t } = useI18n();
  return (
    <button type="submit" className={className} disabled={busy || disabled} aria-busy={busy || undefined}>
      {busy && <span className="spinner" />}
      {busy ? (busyLabel ?? t('common.saving')) : children}
    </button>
  );
}
