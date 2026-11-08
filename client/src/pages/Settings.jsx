import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { LIMITS } from '@shared/limits.js';
import { ApiError, api, errorMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PasswordInput, SubmitButton } from '../components/Controls.jsx';
import Field from '../components/Field.jsx';
import GoogleButton, { GoogleLogo, googleResult } from '../components/GoogleButton.jsx';
import Icon from '../components/Icon.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../components/Toast.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useData, useDiscreetMode, useFetch, usePageTitle } from '../state.jsx';
import { THEMES, useTheme } from '../theme.jsx';

/** "Cài đặt riêng tư": look, profile, language, discreet mode, password, storage, sessions, export, delete. */
export default function Settings() {
  const { t } = useI18n();
  usePageTitle(t('settings.title'));

  return (
    <>
      <PageHeader kicker={t('settings.sub')} title={t('settings.title')} />
      <div className="settings-grid">
        <ThemePanel />
        <ProfilePanel />
        <PasswordPanel />
        <GooglePanel />
        <LanguagePanel />
        <DiscreetPanel />
        <StoragePanel />
        <DataPanel />
        <SessionsPanel />
        <PromisesPanel />
        <DangerPanel />
      </div>
    </>
  );
}

function ThemePanel() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  return (
    <section className="panel panel--wide">
      <div>
        <h2 className="panel-title">{t('theme.title')}</h2>
        <p style={{ marginTop: 6 }}>{t('theme.body')}</p>
      </div>
      <div className="theme-options" role="radiogroup" aria-label={t('theme.label')}>
        {THEMES.map((name) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={theme === name}
            className="theme-option"
            onClick={() => setTheme(name)}
          >
            <span className={`theme-preview theme-preview--${name}`} aria-hidden="true">
              <i />
              <i />
              <b />
            </span>
            <span className="theme-option-name">{t(`theme.${name}`)}</span>
            <span className="theme-option-desc">{t(`theme.${name}Desc`)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ProfilePanel() {
  const { t } = useI18n();
  const { user, setUser } = useAuth();
  const { refresh } = useData();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.patch('/api/me', { name });
      setUser(result.user);
      refresh();
      toast(t('settings.profileSaved'));
    } catch (err) {
      if (err instanceof ApiError && err.fields?.name) setError(err.fields.name);
      else toast(errorMessage(t, err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="panel-title">{t('settings.profileTitle')}</h2>
      <form className="form" onSubmit={submit} noValidate>
        <Field label={t('settings.name')} error={error}>
          {(props) => (
            <input
              {...props}
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={LIMITS.userName}
              autoComplete="nickname"
              required
            />
          )}
        </Field>
        <Field label={t('settings.email')} hint={t('settings.emailHint')}>
          {(props) => <input {...props} className="input" value={user.email} readOnly />}
        </Field>
        <div className="form-actions">
          <SubmitButton busy={busy}>{t('settings.saveProfile')}</SubmitButton>
        </div>
      </form>
    </section>
  );
}

/** Change the password — or, for an account created with Google, set a first one. */
function PasswordPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const { user, setUser } = useAuth();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const firstPassword = !user.hasPassword;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api.post('/api/me/password', values);
      setValues({ currentPassword: '', newPassword: '' });
      toast(firstPassword ? t('settings.passwordSet') : t('settings.passwordChanged'));
      if (firstPassword) setUser({ ...user, hasPassword: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION') setErrors(err.fields);
      else toast(errorMessage(t, err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="panel-title">{firstPassword ? t('settings.setPasswordTitle') : t('settings.passwordTitle')}</h2>
      <form className="form" onSubmit={submit} noValidate>
        {firstPassword ? (
          <p className="field-hint">{t('settings.setPasswordHint')}</p>
        ) : (
          <Field label={t('settings.currentPassword')} error={errors.currentPassword}>
            {(props) => (
              <PasswordInput
                {...props}
                autoComplete="current-password"
                value={values.currentPassword}
                onChange={(event) => setValues((v) => ({ ...v, currentPassword: event.target.value }))}
              />
            )}
          </Field>
        )}
        <Field
          label={t('settings.newPassword')}
          error={errors.newPassword}
          hint={t('auth.passwordHint', { min: LIMITS.passwordMin })}
        >
          {(props) => (
            <PasswordInput
              {...props}
              autoComplete="new-password"
              value={values.newPassword}
              onChange={(event) => setValues((v) => ({ ...v, newPassword: event.target.value }))}
              maxLength={LIMITS.passwordMax}
            />
          )}
        </Field>
        <div className="form-actions">
          <SubmitButton busy={busy}>{firstPassword ? t('settings.setPassword') : t('settings.changePassword')}</SubmitButton>
        </div>
      </form>
    </section>
  );
}

/** "Sign in with Google": link this account to a Google account, or unlink it. */
function GooglePanel() {
  const { t } = useI18n();
  const toast = useToast();
  const { user, setUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  // Coming back from Google (?google=LINKED / TAKEN / …): tell what happened once, then tidy the address.
  useEffect(() => {
    const result = googleResult(location.search);
    if (!result) return;
    toast(t(`google.result.${result}`), result === 'LINKED' ? undefined : 'error');
    navigate('/settings', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  async function unlink() {
    setBusy(true);
    try {
      const { user: updated } = await api.del('/api/me/google');
      setUser(updated);
      toast(t('google.unlinked'));
    } catch (err) {
      toast(errorMessage(t, err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="panel-title">{t('google.settingsTitle')}</h2>
      {user.google ? (
        <div className="form">
          <p className="google-linked">
            <GoogleLogo size={16} />
            <span>{t('google.linkedTo', { email: user.google.email })}</span>
          </p>
          <p className="field-hint">{user.hasPassword ? t('google.unlinkHint') : t('google.needsPassword')}</p>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={unlink} disabled={busy || !user.hasPassword}>
              {t('google.unlink')}
            </button>
          </div>
        </div>
      ) : (
        <div className="form">
          <p className="field-hint">{t('google.notLinked')}</p>
          <GoogleButton mode="link" next="/settings" label={t('google.link')} block={false} />
        </div>
      )}
    </section>
  );
}

function LanguagePanel() {
  const { t } = useI18n();
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">{t('settings.languageTitle')}</h2>
        <LanguageToggle />
      </div>
      <p>{t('settings.languageBody')}</p>
    </section>
  );
}

function DiscreetPanel() {
  const { t } = useI18n();
  const [on, setOn] = useDiscreetMode();
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">{t('settings.discreetTitle')}</h2>
        <button
          type="button"
          className="switch"
          role="switch"
          aria-checked={on}
          aria-label={on ? t('settings.discreetOn') : t('settings.discreetOff')}
          onClick={() => setOn(!on)}
        />
      </div>
      <p>{t('settings.discreetBody')}</p>
    </section>
  );
}

function formatMb(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

function StoragePanel() {
  const { t } = useI18n();
  const { data } = useFetch('/api/me/storage');
  const share = data ? Math.min(100, (data.used / data.quota) * 100) : 0;
  return (
    <section className="panel">
      <h2 className="panel-title">{t('settings.storageTitle')}</h2>
      <p>{t('settings.storageBody')}</p>
      <div
        className="meter"
        role="meter"
        aria-label={t('settings.storageTitle')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share)}
      >
        <span style={{ width: `${Math.max(share, data?.used ? 1.5 : 0)}%` }} />
      </div>
      <div className="meter-label">
        <span>{data ? t('settings.storageUsed', { used: formatMb(data.used) }) : '…'}</span>
        <span>{data ? formatMb(data.quota) : ''}</span>
      </div>
    </section>
  );
}

function DataPanel() {
  const { t } = useI18n();
  return (
    <section className="panel">
      <h2 className="panel-title">{t('settings.dataTitle')}</h2>
      <p>{t('settings.dataBody')}</p>
      <div>
        <a className="btn btn-secondary" href="/api/me/export" download>
          <Icon name="download" size={15} />
          {t('settings.export')}
        </a>
      </div>
    </section>
  );
}

function SessionsPanel() {
  const { t } = useI18n();
  const { signedOut } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function logoutEverywhere() {
    setBusy(true);
    try {
      await api.post('/api/me/logout-all');
      toast(t('settings.logoutAllDone'));
      signedOut();
    } catch (err) {
      toast(errorMessage(t, err), 'error');
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="panel-title">{t('settings.sessionsTitle')}</h2>
      <p>{t('settings.sessionsBody')}</p>
      <div>
        <button type="button" className="btn btn-secondary" onClick={logoutEverywhere} disabled={busy}>
          {busy ? <span className="spinner" /> : <Icon name="devices" size={15} />}
          {t('settings.logoutAll')}
        </button>
      </div>
    </section>
  );
}

function PromisesPanel() {
  const { t } = useI18n();
  return (
    <section className="panel panel--wide">
      <h2 className="panel-title">{t('settings.promisesTitle')}</h2>
      <ul className="promises">
        <li>
          <Icon name="shield" size={16} />
          {t('settings.promise1')}
        </li>
        <li>
          <Icon name="lock" size={16} />
          {t('settings.promise2')}
        </li>
        <li>
          <Icon name="check" size={16} />
          {t('settings.promise3')}
        </li>
        <li>
          <Icon name="eyeOff" size={16} />
          {t('settings.promise4')}
        </li>
        <li>
          <Icon name="pin" size={16} />
          {t('settings.promise5')}
        </li>
        <li>
          <Icon name="users" size={16} />
          {t('settings.promise6')}
        </li>
      </ul>
    </section>
  );
}

function DangerPanel() {
  const { t } = useI18n();
  const { user, signedOut } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.del('/api/me', { email });
      toast(t('settings.deleted'));
      signedOut();
    } catch (err) {
      setError(err instanceof ApiError && err.fields?.email ? err.fields.email : null);
      if (!(err instanceof ApiError && err.fields?.email)) toast(errorMessage(t, err), 'error');
      setBusy(false);
    }
  }

  return (
    <section className="panel panel--wide panel--danger">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">{t('settings.dangerTitle')}</h2>
          <p style={{ marginTop: 6 }}>{t('settings.dangerBody')}</p>
        </div>
        <button type="button" className="btn btn-danger-quiet" onClick={() => setOpen(true)}>
          <Icon name="trash" size={15} />
          {t('settings.deleteAccount')}
        </button>
      </div>

      <Modal
        open={open}
        onClose={() => {
          if (!busy) {
            setOpen(false);
            setEmail('');
            setError(null);
          }
        }}
        title={t('settings.confirmTitle')}
      >
        <form className="form" onSubmit={submit} noValidate>
          <p className="confirm-text">{t('settings.confirmBody', { email: user.email })}</p>
          <Field label={t('settings.confirmLabel')} error={error}>
            {(props) => (
              <input
                {...props}
                className="input"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={user.email}
                data-autofocus
              />
            )}
          </Field>
          <div className="form-actions">
            <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-danger"
              disabled={busy || email.trim().toLowerCase() !== user.email.toLowerCase()}
            >
              {busy && <span className="spinner" />}
              {t('settings.confirmAction')}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
