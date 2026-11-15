import { useState } from 'react';
import { Link } from 'react-router';
import { LIMITS } from '@shared/limits.js';
import { ApiError, api, errorMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import Brand from '../components/Brand.jsx';
import { SubmitButton } from '../components/Controls.jsx';
import Field from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';
import { useI18n } from '../i18n/index.jsx';
import { usePageTitle } from '../state.jsx';

const EMPTY = { kind: 'feedback', name: '', email: '', message: '', website: '' };

/** Public contact page. Logged-out visitors and signed-in people use the same form. */
export default function Contact() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  usePageTitle(t('contact.title'));

  const home = user ? '/today' : '/';

  function set(field) {
    return (event) => {
      const value = event.target.value;
      setForm((current) => ({ ...current, [field]: value }));
      setErrors((current) => ({ ...current, [field]: undefined }));
    };
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await api.post('/api/contact', form);
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.fields && Object.keys(err.fields).length) setErrors(err.fields);
      else setFormError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="contact-page">
      <header className="landing-top">
        <Brand to={home} />
        <nav className="landing-nav" aria-label="Memory Lane">
          <Link to="/#features">{t('landing.navFeatures')}</Link>
          <Link to="/#sharing">{t('landing.navSharing')}</Link>
          <Link to="/#privacy">{t('landing.navPrivacy')}</Link>
          <Link to="/contact" aria-current="page">
            {t('contact.nav')}
          </Link>
        </nav>
        <div className="landing-tools">
          <LanguageToggle />
          {user ? (
            <Link to="/today" className="btn btn-primary">
              {t('contact.backToAlbum')}
            </Link>
          ) : (
            <Link to="/login" className="btn btn-quiet">
              {t('landing.login')}
            </Link>
          )}
        </div>
      </header>

      <main className="contact-main" id="main">
        <span className="kicker">{t('contact.nav')}</span>
        <h1>{t('contact.title')}</h1>
        <p className="contact-sub">{t('contact.sub')}</p>

        {sent ? (
          <div className="contact-card contact-success" role="status">
            <Icon name="check" size={28} />
            <h2>{t('contact.successTitle')}</h2>
            <p>{t('contact.successBody')}</p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setForm(EMPTY);
                setSent(false);
              }}
            >
              {t('contact.another')}
            </button>
          </div>
        ) : (
          <form className="contact-card" noValidate onSubmit={submit}>
            {formError && (
              <div className="form-error" role="alert">
                {formError}
              </div>
            )}

            <Field label={t('contact.type')} error={errors.kind}>
              {(props) => (
                <select {...props} className="select" value={form.kind} onChange={set('kind')} required>
                  <option value="feedback">{t('contact.kinds.feedback')}</option>
                  <option value="suggestion">{t('contact.kinds.suggestion')}</option>
                  <option value="collaboration">{t('contact.kinds.collaboration')}</option>
                </select>
              )}
            </Field>

            <Field label={t('contact.name')} error={errors.name}>
              {(props) => (
                <input
                  {...props}
                  className="input"
                  type="text"
                  name="name"
                  autoComplete="name"
                  maxLength={LIMITS.contactName}
                  value={form.name}
                  onChange={set('name')}
                  placeholder={t('contact.namePlaceholder')}
                  required
                />
              )}
            </Field>

            <Field label={t('contact.email')} error={errors.email}>
              {(props) => (
                <input
                  {...props}
                  className="input"
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  maxLength={LIMITS.email}
                  value={form.email}
                  onChange={set('email')}
                  placeholder={t('contact.emailPlaceholder')}
                  required
                />
              )}
            </Field>

            <Field label={t('contact.message')} error={errors.message}>
              {(props) => (
                <textarea
                  {...props}
                  className="textarea"
                  name="message"
                  maxLength={LIMITS.contactMessage}
                  value={form.message}
                  onChange={set('message')}
                  placeholder={t('contact.messagePlaceholder')}
                  required
                />
              )}
            </Field>

            {/* Honeypot: people never see this. A bot that fills it is dropped on the server. */}
            <div className="hp-field" aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input
                id="website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={set('website')}
              />
            </div>

            <div className="form-actions">
              <SubmitButton busy={busy} busyLabel={t('contact.sending')}>
                {t('contact.submit')}
                <Icon name="send" size={16} />
              </SubmitButton>
            </div>
          </form>
        )}
      </main>

      <footer className="landing-foot">
        <Brand to={home} />
        <span>{t('landing.footer')}</span>
        <nav aria-label={t('landing.footerNav')}>
          <Link to="/">{t('auth.backHome')}</Link>
          <Link to="/contact">{t('contact.nav')}</Link>
        </nav>
      </footer>
    </div>
  );
}
