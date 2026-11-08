import { useState } from 'react';
import { LIMITS } from '@shared/limits.js';
import { ApiError, api, errorMessage } from '../api.js';
import { fieldMessage, useI18n } from '../i18n/index.jsx';
import { useData } from '../state.jsx';
import Icon from './Icon.jsx';
import InviteLink from './InviteLink.jsx';
import Modal from './Modal.jsx';

/**
 * Create an invite link to send through Zalo, Messenger… The person who opens it creates an
 * account (or logs in) and joins your circle; the memory attached to the invite (if any) is
 * shared with them. `context` is null (closed) or { memory?, person? }.
 */
export default function InviteDialog({ context, onClose }) {
  const { t } = useI18n();
  return (
    <Modal open={Boolean(context)} onClose={onClose} title={t('invite.title')} kicker={t('invite.kicker')}>
      {context && <InviteForm context={context} onClose={onClose} />}
    </Modal>
  );
}

function InviteForm({ context, onClose }) {
  const { t, dateTime } = useI18n();
  const { refresh } = useData();
  const [label, setLabel] = useState(context.person?.name ?? '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null); // { url, invite }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { invite, token } = await api.post('/api/invites', {
        label,
        personId: context.person?.id ?? null,
        memoryId: context.memory?.id ?? null,
      });
      setCreated({ invite, url: `${window.location.origin}/join/${token}` });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError && err.fields?.label ? fieldMessage(t, err.fields.label) : errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="form">
        <div className="link-box">
          <strong>{t('invite.readyTitle')}</strong>
          <InviteLink url={created.url} />
          <span className="field-hint">{t('invite.onceOnly', { date: dateTime(created.invite.expiresAt) })}</span>
        </div>
        <ul className="how-list">
          <li>{t('invite.step1')}</li>
          <li>{t('invite.step2')}</li>
          <li>{created.invite.memory ? t('invite.step3Memory', { title: created.invite.memory.title }) : t('invite.step3')}</li>
        </ul>
        <div className="form-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            {t('invite.done')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <p className="confirm-text">{t('invite.intro')}</p>
      {context.memory && (
        <div className="owner-note">
          <Icon name="image" size={18} />
          <span>{t('invite.withMemory', { title: context.memory.title })}</span>
        </div>
      )}
      <div className="field">
        <label className="field-label" htmlFor="invite-label">
          <span>{t('invite.label')}</span>
          <span className="optional">{t('common.optional')}</span>
        </label>
        <input
          id="invite-label"
          className="input"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={t('invite.labelPlaceholder')}
          maxLength={LIMITS.inviteLabel}
          data-autofocus
        />
        <span className="field-hint">{t('invite.labelHint')}</span>
        {error && (
          <span className="field-error" role="alert">
            {error}
          </span>
        )}
      </div>
      <ul className="invite-points">
        <li>
          <Icon name="link" size={15} />
          <span>{t('invite.point1')}</span>
        </li>
        <li>
          <Icon name="lock" size={15} />
          <span>{t('invite.point2')}</span>
        </li>
        <li>
          <Icon name="userMinus" size={15} />
          <span>{t('invite.point3')}</span>
        </li>
      </ul>
      <div className="form-actions">
        <button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <span className="spinner" /> : <Icon name="link" size={15} />}
          {t('invite.create')}
        </button>
      </div>
    </form>
  );
}
