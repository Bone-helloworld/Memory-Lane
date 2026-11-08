import { useEffect, useState } from 'react';
import { LIMITS } from '@shared/limits.js';
import { ApiError, api, errorMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import { fieldMessage, useI18n } from '../i18n/index.jsx';
import { useData, useFetch } from '../state.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import Icon from './Icon.jsx';
import { SectionHead } from './PageHeader.jsx';
import { Avatar } from './People.jsx';
import { ErrorState, Skeleton } from './States.jsx';
import { useToast } from './Toast.jsx';

const COLORS = ['teal', 'amber', 'rose', 'ink'];
const colorFor = (id) => COLORS[id % COLORS.length];

/**
 * "Lời nhắn": messages under a memory from its owner and the people it is shared with.
 * Sticky notes in the notebook, a lab log in the darkroom. The author — or the owner of the
 * memory — can delete a message.
 */
export default function Comments({ memory }) {
  const { t, timestamp } = useI18n();
  const { user } = useAuth();
  const { refresh } = useData();
  const toast = useToast();
  const { data, error, retry } = useFetch(`/api/memories/${memory.id}/comments`);
  const [comments, setComments] = useState(null);
  const [body, setBody] = useState('');
  const [fieldError, setFieldError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    if (data) setComments(data.comments);
  }, [data]);

  // Live: a note written by someone else right now appears here without reloading (LiveUpdates.jsx).
  useEffect(() => {
    const onLive = ({ detail }) => {
      if (detail.memoryId !== memory.id) return;
      if (detail.type === 'comment') {
        setComments((list) =>
          list && !list.some((comment) => comment.id === detail.comment.id) ? [...list, { ...detail.comment, fresh: true }] : list,
        );
      }
      if (detail.type === 'comment-removed') {
        setComments((list) => list?.filter((comment) => comment.id !== detail.commentId));
      }
    };
    window.addEventListener('ml-live', onLive);
    return () => window.removeEventListener('ml-live', onLive);
  }, [memory.id]);

  const isOwner = memory.access === 'owner';
  const hint = isOwner
    ? memory.shareCount
      ? t('comments.hintShared', { count: memory.shareCount })
      : t('comments.hintPrivate')
    : t('comments.hintRecipient', { name: memory.owner.name });

  async function submit(event) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setFieldError(null);
    try {
      const { comment } = await api.post(`/api/memories/${memory.id}/comments`, { body });
      setComments((list) => [...(list ?? []), comment]);
      setBody('');
      refresh();
    } catch (err) {
      setFieldError(err instanceof ApiError && err.fields?.body ? fieldMessage(t, err.fields.body) : errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    await api.del(`/api/memories/${memory.id}/comments/${deleting.id}`);
    setComments((list) => list.filter((comment) => comment.id !== deleting.id));
    setDeleting(null);
    toast(t('comments.deleted'));
    refresh();
  }

  return (
    <section className="comments" aria-labelledby="comments-title">
      <SectionHead
        kicker={
          <>
            {t('comments.kicker')}
            <span className="live-dot" title={t('live.on')}>
              <span className="visually-hidden">{t('live.on')}</span>
            </span>
          </>
        }
        title={comments?.length ? t('comments.titleCount', { count: comments.length }) : t('comments.title')}
        id="comments-title"
      />

      {error && <ErrorState error={error} onRetry={retry} />}
      {!comments && !error && <Skeleton height={90} count={2} />}
      {comments?.length === 0 && <p className="story-empty" style={{ marginBottom: 18 }}>{t('comments.empty')}</p>}
      {comments?.length > 0 && (
        <ol className="comment-list" style={{ marginBottom: 26 }}>
          {comments.map((comment) => (
            <li key={comment.id} className={`comment${comment.fresh ? ' is-fresh' : ''}`}>
              <div className="comment-head">
                <span className="comment-author">
                  <Avatar name={comment.author.name} color={colorFor(comment.author.id)} />
                  {comment.author.id === user.id ? t('comments.you') : comment.author.name}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <time className="comment-time" dateTime={comment.createdAt}>
                    {timestamp(comment.createdAt)}
                  </time>
                  {(comment.author.id === user.id || isOwner) && (
                    <button
                      type="button"
                      className="comment-delete"
                      onClick={() => setDeleting(comment)}
                      aria-label={t('comments.delete')}
                      title={t('comments.delete')}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </span>
              </div>
              <p className="comment-body private text">{comment.body}</p>
            </li>
          ))}
        </ol>
      )}

      <form className="comment-form" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="comment-body">
          {t('comments.placeholder')}
        </label>
        <textarea
          id="comment-body"
          className="textarea"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event);
          }}
          placeholder={t('comments.placeholder')}
          maxLength={LIMITS.comment}
        />
        {fieldError && (
          <span className="field-error" role="alert">
            {fieldError}
          </span>
        )}
        <footer>
          <span className="comment-hint">
            <Icon name={isOwner && !memory.shareCount ? 'lock' : 'users'} size={13} />
            {hint}
          </span>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !body.trim()}>
            {busy ? <span className="spinner" /> : <Icon name="send" size={14} />}
            {t('comments.send')}
          </button>
        </footer>
      </form>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('comments.confirmTitle')}
        body={t('comments.confirmBody')}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </section>
  );
}
