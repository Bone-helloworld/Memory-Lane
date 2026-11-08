import { useState } from 'react';
import { LIMITS } from '@shared/limits.js';
import { api, errorMessage } from '../../api.js';
import { useI18n } from '../../i18n/index.jsx';
import Icon from '../Icon.jsx';
import InviteLink from '../InviteLink.jsx';
import { Avatar } from '../People.jsx';
import { Skeleton } from '../States.jsx';

const COLORS = ['teal', 'amber', 'rose', 'ink'];

/**
 * "Share this memory", inside the memory form: tick people from your circle, or create an invite
 * link for someone who is not on Memory Lane yet — even before the memory is saved. The link is
 * created at once (so it can be sent right away); MemoryForm attaches the memory to it on Save.
 *
 * circle: people you are connected with (null while loading) · selected: ticked user ids ·
 * invites: links created in this form · memoryId: set when editing an existing memory.
 */
export default function ShareFields({ circle, selected, onToggle, invites, onInvite, memoryId, disabled }) {
  const { t, timestamp } = useI18n();
  const [asking, setAsking] = useState(false);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function createInvite() {
    setBusy(true);
    setError(null);
    try {
      // Editing: the memory exists, so it goes into the invite now. New memory: attached on Save.
      const { invite, token } = await api.post('/api/invites', { label: label.trim(), memoryId: memoryId ?? null });
      onInvite({
        id: invite.id,
        label: invite.label,
        expiresAt: invite.expiresAt,
        url: `${window.location.origin}/join/${token}`,
        attached: Boolean(memoryId),
      });
      setLabel('');
      setAsking(false);
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="share-fields" aria-labelledby="share-fields-title">
      <div className="share-fields-head">
        <span className="field-label" id="share-fields-title">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="users" size={16} />
            {t('memoryShare.title')}
          </span>
          <span className="optional">{t('common.optional')}</span>
        </span>
        {selected.length > 0 && <span className="share-hint">{t('share.count', { count: selected.length })}</span>}
      </div>
      <p className="field-hint">{t('memoryShare.hint')}</p>

      {circle === null && <Skeleton height={38} />}
      {circle?.length === 0 && <p className="field-hint">{t('memoryShare.emptyCircle')}</p>}
      {circle?.length > 0 && (
        <div className="chips" role="group" aria-label={t('memoryShare.title')}>
          {circle.map((person) => (
            <button
              key={person.id}
              type="button"
              className="chip"
              aria-pressed={selected.includes(person.id)}
              onClick={() => onToggle(person.id)}
              disabled={disabled}
            >
              <Avatar name={person.name} color={COLORS[person.id % COLORS.length]} />
              {person.name}
              {selected.includes(person.id) && <Icon name="check" size={14} strokeWidth={2} />}
            </button>
          ))}
        </div>
      )}

      {invites.map((invite) => (
        <div className="link-box" key={invite.id}>
          <strong>{invite.label ? t('memoryShare.linkFor', { name: invite.label }) : t('invite.readyTitle')}</strong>
          <InviteLink url={invite.url} />
          <span className="field-hint">
            {invite.attached
              ? t('memoryShare.linkNoteSaved', { date: timestamp(invite.expiresAt) })
              : t('memoryShare.linkNote', { date: timestamp(invite.expiresAt) })}
          </span>
        </div>
      ))}

      {asking ? (
        <div className="invite-inline">
          <input
            className="input"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            // Enter would submit the whole memory form: create the link instead.
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (!busy) createInvite();
              }
            }}
            placeholder={t('memoryShare.invitePlaceholder')}
            aria-label={t('invite.label')}
            maxLength={LIMITS.inviteLabel}
            autoFocus
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={createInvite} disabled={busy}>
            {busy && <span className="spinner" />}
            {t('invite.create')}
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAsking(false)} disabled={busy}>
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        <div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAsking(true)} disabled={disabled}>
            <Icon name="userPlus" size={15} />
            {invites.length ? t('memoryShare.another') : t('memoryShare.inviteNew')}
          </button>
        </div>
      )}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </section>
  );
}
