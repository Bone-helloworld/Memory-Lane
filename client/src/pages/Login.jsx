import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { errorMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PasswordInput, SubmitButton } from '../components/Controls.jsx';
import Field from '../components/Field.jsx';
import GoogleButton, { googleResult } from '../components/GoogleButton.jsx';
import { returnPath } from '../components/RouteGuards.jsx';
import { useI18n } from '../i18n/index.jsx';
import { usePageTitle } from '../state.jsx';
import AuthLayout from './AuthLayout.jsx';

export default function Login() {
  const { t } = useI18n();
  const { login, demo, demoEnabled } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  usePageTitle(t('auth.loginTitle'));

  const from = returnPath(location);
  const fromInvite = from.startsWith('/join/');
  // Back from Google with a problem (?google=EMAIL_TAKEN…): say what happened.
  const google = googleResult(location.search);

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(t, err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form
        className="auth-card"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          run(() => login(email, password));
        }}
      >
        <div>
          <h1 className="auth-title">{t('auth.loginTitle')}</h1>
          <p className="auth-sub">{fromInvite ? t('join.loginHint') : t('auth.loginSub')}</p>
        </div>

        {(error || google) && (
          <div className="form-error" role="alert">
            {error ?? t(`google.result.${google}`)}
          </div>
        )}

        <GoogleButton next={from} />
        <div className="divider">{t('google.orEmail')}</div>

        <div className="form">
          <Field label={t('auth.email')}>
            {(props) => (
              <input
                {...props}
                className="input"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                autoFocus
                required
              />
            )}
          </Field>
          <Field label={t('auth.password')}>
            {(props) => (
              <PasswordInput
                {...props}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            )}
          </Field>
          <SubmitButton busy={busy} busyLabel={t('auth.submitLogin')} className="btn btn-primary btn-block">
            {t('auth.submitLogin')}
          </SubmitButton>
        </div>

        {demoEnabled && !fromInvite && (
          <>
            <div className="divider">{t('auth.or')}</div>
            <div className="demo-row">
              <button type="button" className="btn btn-secondary btn-block" disabled={busy} onClick={() => run(() => demo())}>
                {t('auth.demo')}
              </button>
              <button type="button" className="demo-friend" disabled={busy} onClick={() => run(() => demo('friend'))}>
                {t('auth.demoFriend')}
              </button>
            </div>
          </>
        )}

        <p className="auth-alt">
          {t('auth.noAccount')}{' '}
          <Link to="/register" state={{ from }}>
            {t('auth.toRegister')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
