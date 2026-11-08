import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, errorMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icon.jsx';
import GoogleButton, { GoogleLogo } from '../components/GoogleButton.jsx';
import { Avatar } from '../components/People.jsx';
import { Skeleton } from '../components/States.jsx';
import { useToast } from '../components/Toast.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useFetch, usePageTitle } from '../state.jsx';
import AuthLayout from './AuthLayout.jsx';

/**
 * /join/:token — where an invite link lands. Anyone can see who sent it; accepting needs an
 * account (sign up or log in, then come back here) and an explicit click: nobody is added
 * to a circle without choosing to be.
 * Signed in already? Your own link shows what the recipient will see (and how to try it for real);
 * someone else's link can be accepted — or you log out here to use another account.
 */
export default function Join() {
  const { token } = useParams();
  const { t, dateTime, daysLeft } = useI18n();
  const { user, setUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, error } = useFetch(`/api/invites/preview/${encodeURIComponent(token)}`);
  const [busy, setBusy] = useState(false);
  const [acceptError, setAcceptError] = useState(null);
  usePageTitle(t('join.pageTitle'));

  const invite = data?.invite;
  const here = { from: `/join/${token}` };

  /** "Not you?" — log out but stay on this page, which then offers to sign up or log in. */
  async function switchAccount() {
    await api.post('/api/auth/logout').catch(() => {});
    setUser(null);
  }

  async function accept() {
    setBusy(true);
    setAcceptError(null);
    try {
      const result = await api.post(`/api/invites/accept/${encodeURIComponent(token)}`);
      toast(t('join.accepted', { name: result.inviter.name }));
      navigate(result.memoryId ? `/album/${result.memoryId}` : '/sharing', { replace: true });
    } catch (err) {
      setAcceptError(errorMessage(t, err));
      setBusy(false);
    }
  }

  let content;
  if (error) {
    content = (
      <div className="invite-card">
        <h1 className="auth-title">{t('join.invalidTitle')}</h1>
        <p className="auth-sub">{t('join.invalidBody')}</p>
        <Link to={user ? '/today' : '/'} className="btn btn-secondary">
          <Icon name="arrowLeft" size={15} />
          {user ? t('join.backToAlbum') : t('auth.backHome')}
        </Link>
      </div>
    );
  } else if (!invite || user === undefined) {
    content = <Skeleton height={260} />;
  } else {
    content = (
      <div className="invite-card">
        <div className="invite-from">
          <Avatar name={invite.inviter.name} color="amber" />
          <div>
            <span className="kicker">{t('join.kicker')}</span>
            <h1 className="auth-title">{t('join.title', { name: invite.inviter.name })}</h1>
          </div>
        </div>
        {invite.memory && (
          <div className="invite-memory">
            <Icon name="image" size={18} />
            <span>{t('join.withMemory', { name: invite.inviter.name, title: invite.memory.title })}</span>
          </div>
        )}
        <ul className="invite-points">
          <li>
            <Icon name="users" size={15} />
            <span>{t('join.point1', { name: invite.inviter.name })}</span>
          </li>
          <li>
            <Icon name="lock" size={15} />
            <span>{t('join.point2', { name: invite.inviter.name })}</span>
          </li>
          <li>
            <Icon name="userMinus" size={15} />
            <span>{t('join.point3')}</span>
          </li>
        </ul>
        {acceptError && (
          <div className="form-error" role="alert">
            {acceptError}
          </div>
        )}
        <div className="invite-actions">
          {invite.own ? (
            <>
              <p className="auth-sub">{t('join.own')}</p>
              {/* What the person who opens the link will see — a picture of it, nothing to click. */}
              <div className="invite-preview" inert aria-hidden="true">
                <span className="invite-preview-label">{t('join.previewLabel')}</span>
                <span className="btn btn-primary btn-block">{t('join.register')}</span>
                <span className="btn btn-google btn-block">
                  <GoogleLogo />
                  {t('google.continue')}
                </span>
                <span className="auth-alt">
                  {t('auth.haveAccount')} <u>{t('auth.toLogin')}</u>
                </span>
              </div>
              <p className="field-hint">{t('join.ownTry')}</p>
              <Link to="/sharing" className="btn btn-secondary">
                {t('nav.tabs.sharing')}
              </Link>
            </>
          ) : user ? (
            <>
              <button type="button" className="btn btn-primary btn-block" onClick={accept} disabled={busy}>
                {busy ? <span className="spinner" /> : <Icon name="check" size={16} />}
                {t('join.accept')}
              </button>
              <p className="field-hint">{t('join.signedInAs', { name: user.name })}</p>
              <button type="button" className="invite-switch" onClick={switchAccount}>
                {t('join.switchAccount')}
              </button>
            </>
          ) : (
            <>
              <Link to="/register" state={here} className="btn btn-primary btn-block">
                {t('join.register')}
              </Link>
              <GoogleButton next={here.from} />
              <p className="auth-alt">
                {t('auth.haveAccount')}{' '}
                <Link to="/login" state={here}>
                  {t('auth.toLogin')}
                </Link>
              </p>
            </>
          )}
          <p className="field-hint">
            {t('join.expires', { date: dateTime(invite.expiresAt) })} {t('join.daysLeft', { count: daysLeft(invite.expiresAt) })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <AuthLayout>
      <div className="auth-card">{content}</div>
    </AuthLayout>
  );
}
