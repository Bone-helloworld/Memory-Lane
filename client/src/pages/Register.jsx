import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { LIMITS } from '@shared/limits.js';
import { ApiError, errorMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PasswordInput, SubmitButton } from '../components/Controls.jsx';
import Field from '../components/Field.jsx';
import GoogleButton from '../components/GoogleButton.jsx';
import { returnPath } from '../components/RouteGuards.jsx';
import { useI18n } from '../i18n/index.jsx';
import { usePageTitle } from '../state.jsx';
import AuthLayout from './AuthLayout.jsx';

export default function Register() {
  const { t } = useI18n();
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  usePageTitle(t('auth.registerTitle'));

  // Arriving from an invite link: go back to it after signing up, to accept it.
  const from = returnPath(location);
  const fromInvite = from.startsWith('/join/');

  const update = (name) => (event) => setValues((current) => ({ ...current, [name]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      await register(values);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION') setErrors(err.fields);
      else setFormError(errorMessage(t, err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={submit} noValidate>
        <div>
          <h1 className="auth-title">{t('auth.registerTitle')}</h1>
          <p className="auth-sub">{fromInvite ? t('join.registerHint') : t('auth.registerSub')}</p>
        </div>

        {formError && (
          <div className="form-error" role="alert">
            {formError}
          </div>
        )}

        <GoogleButton next={from} label={t('google.signUp')} />
        <div className="divider">{t('google.orEmail')}</div>

        <div className="form">
          <Field label={t('auth.name')} error={errors.name}>
            {(props) => (
              <input
                {...props}
                className="input"
                autoComplete="nickname"
                value={values.name}
                onChange={update('name')}
                placeholder={t('auth.namePlaceholder')}
                maxLength={LIMITS.userName}
                autoFocus
                required
              />
            )}
          </Field>
          <Field label={t('auth.email')} error={errors.email}>
            {(props) => (
              <input
                {...props}
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={values.email}
                onChange={update('email')}
                placeholder={t('auth.emailPlaceholder')}
                maxLength={LIMITS.email}
                required
              />
            )}
          </Field>
          <Field label={t('auth.password')} error={errors.password} hint={t('auth.passwordHint', { min: LIMITS.passwordMin })}>
            {(props) => (
              <PasswordInput
                {...props}
                autoComplete="new-password"
                value={values.password}
                onChange={update('password')}
                minLength={LIMITS.passwordMin}
                maxLength={LIMITS.passwordMax}
                required
              />
            )}
          </Field>
          <SubmitButton busy={busy} busyLabel={t('auth.submitRegister')} className="btn btn-primary btn-block">
            {t('auth.submitRegister')}
          </SubmitButton>
        </div>

        <p className="auth-alt">
          {t('auth.haveAccount')}{' '}
          <Link to="/login" state={{ from }}>
            {t('auth.toLogin')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
