import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { LIMITS } from '@shared/limits.js';
import { toISODate } from '@shared/dates.js';
import { ApiError, api, errorMessage } from '../api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import PersonForm from '../components/forms/PersonForm.jsx';
import Icon from '../components/Icon.jsx';
import { MemoryGrid } from '../components/Memories.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader, { SectionHead } from '../components/PageHeader.jsx';
import { Avatar, ClosenessDots, ContactTag } from '../components/People.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/States.jsx';
import { useToast } from '../components/Toast.jsx';
import { fieldMessage, useI18n } from '../i18n/index.jsx';
import { useComposer, useData, useFetch, usePageTitle } from '../state.jsx';
import { MissingPage } from './NotFound.jsx';

/**
 * One person: how long it has been, a private journal about them, the memories you share —
 * and an invite to Memory Lane, so they can see the memories you choose to share with them.
 */
export default function PersonDetail() {
  const { id } = useParams();
  const { t, fullDate, ago, timestamp } = useI18n();
  const { refresh } = useData();
  const { openInvite } = useComposer();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { data, error, retry } = useFetch(`/api/people/${encodeURIComponent(id)}`);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(null); // { kind: 'person' } | { kind: 'note', note } | { kind: 'invite', invite }
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState(null);
  const [savingNote, setSavingNote] = useState(false);
  const [contacting, setContacting] = useState(false);
  const scrolled = useRef(false);
  const person = data?.person;
  usePageTitle(person?.name ?? t('nav.people'));

  // Coming from a "Notes" button (…#notes): scroll to the journal once.
  useEffect(() => {
    if (data && location.hash === '#notes' && !scrolled.current) {
      scrolled.current = true;
      document.getElementById('notes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [data, location.hash]);

  if (error?.status === 404) return <MissingPage backTo="/people" backLabel={t('nav.people')} />;
  if (error) return <ErrorState error={error} onRetry={retry} />;
  if (!person) return <Skeleton height={140} count={2} />;

  const pendingInvites = data.invites.filter((invite) => invite.status === 'pending');

  async function markContacted() {
    setContacting(true);
    try {
      await api.post(`/api/people/${person.id}/contacted`, { date: toISODate() });
      toast(t('person.contactedDone'));
      refresh();
    } catch (err) {
      toast(errorMessage(t, err), 'error');
    } finally {
      setContacting(false);
    }
  }

  async function addNote(event) {
    event.preventDefault();
    if (!note.trim()) return;
    setSavingNote(true);
    setNoteError(null);
    try {
      await api.post(`/api/people/${person.id}/notes`, { body: note });
      setNote('');
      toast(t('person.noteSaved'));
      refresh();
    } catch (err) {
      setNoteError(err instanceof ApiError && err.fields?.body ? fieldMessage(t, err.fields.body) : errorMessage(t, err));
    } finally {
      setSavingNote(false);
    }
  }

  async function confirmDelete() {
    if (confirm.kind === 'note') {
      await api.del(`/api/people/${person.id}/notes/${confirm.note.id}`);
      setConfirm(null);
      toast(t('person.noteDeleted'));
      refresh();
      return;
    }
    if (confirm.kind === 'invite') {
      await api.del(`/api/invites/${confirm.invite.id}`);
      setConfirm(null);
      toast(t('sharing.revoked'));
      refresh();
      return;
    }
    await api.del(`/api/people/${person.id}`);
    setConfirm(null);
    toast(t('person.deleted', { name: person.name }));
    navigate('/people', { replace: true });
    refresh();
  }

  const confirmText = {
    note: [t('person.confirmNoteTitle'), t('person.confirmNoteBody'), undefined],
    invite: [t('sharing.revokeTitle'), t('sharing.revokeBody'), t('sharing.revoke')],
    person: [t('person.confirmTitle', { name: person.name }), t('person.confirmBody', { name: person.name }), undefined],
  }[confirm?.kind ?? 'person'];

  return (
    <>
      <Link to="/people" className="back-link">
        <Icon name="arrowLeft" size={14} />
        {t('nav.people')}
      </Link>
      <PageHeader title={person.name} subtitle={person.relation || ' '} />

      <section className="profile">
        <Avatar name={person.name} color={person.color} className="avatar--lg" />
        <div className="profile-facts">
          <div className="profile-line">
            <ContactTag lastContact={person.lastContact} />
            <ClosenessDots value={person.closeness} />
          </div>
          <div className="profile-line">
            <Icon name="clock" size={14} />
            {person.lastContact
              ? t('person.lastLine', { date: fullDate(person.lastContact), ago: ago(person.lastContact) })
              : t('person.never')}
          </div>
        </div>
        <div className="profile-actions">
          <button type="button" className="btn btn-primary" onClick={markContacted} disabled={contacting}>
            {contacting ? <span className="spinner" /> : <Icon name="message" size={15} />}
            {t('person.contacted')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
            <Icon name="pencil" size={15} />
            {t('common.edit')}
          </button>
          <button type="button" className="btn btn-danger-quiet" onClick={() => setConfirm({ kind: 'person' })}>
            <Icon name="trash" size={15} />
            {t('common.delete')}
          </button>
        </div>
      </section>

      <div className="invite-note">
        {person.linked ? (
          <>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <Icon name="link" size={16} />
              <span>{t('person.linkedLine', { name: person.name, account: person.linked.name })}</span>
            </span>
            <Link to="/sharing" className="btn btn-secondary btn-sm">
              {t('nav.tabs.sharing')}
            </Link>
          </>
        ) : (
          <>
            <span style={{ display: 'grid', gap: 2 }}>
              <strong>{t('person.inviteTitle', { name: person.name })}</strong>
              <span className="muted" style={{ fontSize: 13.5 }}>
                {pendingInvites.length
                  ? t('person.invitePending', { date: timestamp(pendingInvites[0].createdAt) })
                  : t('person.inviteBody')}
              </span>
            </span>
            <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {pendingInvites.length > 0 && (
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => setConfirm({ kind: 'invite', invite: pendingInvites[0] })}
                >
                  {t('sharing.revoke')}
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => openInvite({ person: { id: person.id, name: person.name } })}
              >
                <Icon name="userPlus" size={15} />
                {pendingInvites.length ? t('person.inviteAgain') : t('person.invite')}
              </button>
            </span>
          </>
        )}
      </div>

      <div className="two-col">
        <section id="notes" aria-labelledby="notes-title">
          <SectionHead kicker={t('person.notesEyebrow', { name: person.name })} title={t('person.notesTitle')} id="notes-title" />

          <form className="note-form" onSubmit={addNote}>
            <label className="visually-hidden" htmlFor="note-body">
              {t('person.notePlaceholder', { name: person.name })}
            </label>
            <textarea
              id="note-body"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) addNote(event);
              }}
              placeholder={t('person.notePlaceholder', { name: person.name })}
              maxLength={LIMITS.note}
            />
            <footer>
              <span className="counter">
                {note.length}/{LIMITS.note}
              </span>
              <button type="submit" className="btn btn-primary btn-sm" disabled={savingNote || !note.trim()}>
                {savingNote && <span className="spinner" />}
                {t('person.addNote')}
              </button>
            </footer>
          </form>
          {noteError && (
            <p className="field-error" role="alert" style={{ marginTop: 8 }}>
              {noteError}
            </p>
          )}

          {data.notes.length ? (
            <ol className="notes">
              {data.notes.map((item) => (
                <li key={item.id} className="note">
                  <div className="note-head">
                    <time dateTime={item.createdAt}>{timestamp(item.createdAt)}</time>
                    <button
                      type="button"
                      className="note-delete"
                      aria-label={t('person.deleteNote')}
                      title={t('person.deleteNote')}
                      onClick={() => setConfirm({ kind: 'note', note: item })}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                  <p className="note-text private text">{item.body}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="story-empty" style={{ marginTop: 22 }}>
              {t('person.noNotes', { name: person.name })}
            </p>
          )}
        </section>

        <section aria-labelledby="together-title">
          <SectionHead
            kicker={t('person.memoriesEyebrow', { count: data.memories.length })}
            title={t('person.memoriesTitle')}
            id="together-title"
          />
          {data.memories.length ? (
            <MemoryGrid memories={data.memories} compact />
          ) : (
            <EmptyState compact title={t('person.noMemories', { name: person.name })} />
          )}
        </section>
      </div>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title={t('person.editTitle', { name: person.name })}
        kicker={t('person.eyebrow')}
      >
        <PersonForm
          person={person}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            toast(t('person.saved'));
            refresh();
          }}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirmText[0]}
        body={confirmText[1]}
        confirmLabel={confirmText[2]}
        onConfirm={confirmDelete}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}
