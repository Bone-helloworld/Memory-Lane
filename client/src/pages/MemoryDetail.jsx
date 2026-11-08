import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api.js';
import CardStudio from '../components/CardStudio.jsx';
import Comments from '../components/Comments.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import Gallery from '../components/Gallery.jsx';
import Icon from '../components/Icon.jsx';
import { Avatar } from '../components/People.jsx';
import SharePanel from '../components/SharePanel.jsx';
import { ErrorState, Skeleton } from '../components/States.jsx';
import { useToast } from '../components/Toast.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useComposer, useData, useFetch, usePageTitle } from '../state.jsx';
import { MissingPage } from './NotFound.jsx';

/** "3 photos · 1 video" */
function fileSummary(t, files) {
  const photos = files.filter((file) => file.kind === 'image').length;
  const videos = files.length - photos;
  return [photos && t('memory.photoCount', { count: photos }), videos && t('memory.videoCount', { count: videos })]
    .filter(Boolean)
    .join(' · ');
}

/**
 * One memory: its photos and videos, its story, who was there — and, for its owner, who it is
 * shared with. Someone it was shared with sees the same page read-only, plus the messages.
 */
export default function MemoryDetail() {
  const { id } = useParams();
  const { t, memoryDate, timestamp } = useI18n();
  const { openMemory } = useComposer();
  const { refresh } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, error, retry } = useFetch(`/api/memories/${encodeURIComponent(id)}`);
  const [confirming, setConfirming] = useState(false);
  const [studio, setStudio] = useState(false); // "make a keepsake card"
  const memory = data?.memory;
  const isOwner = memory?.access === 'owner';
  usePageTitle(memory?.title ?? t('nav.album'));

  const backTo = memory && !isOwner ? '/sharing' : '/album';
  const back = (
    <Link to={backTo} className="back-link">
      <Icon name="arrowLeft" size={14} />
      {memory && !isOwner ? t('nav.tabs.sharing') : t('memory.back')}
    </Link>
  );

  if (error?.status === 404) return <MissingPage backTo="/album" backLabel={t('memory.back')} />;
  if (error) return <>{back}<ErrorState error={error} onRetry={retry} /></>;
  if (!memory) return <>{back}<Skeleton height={460} radius={8} /></>;

  async function remove() {
    await api.del(`/api/memories/${memory.id}`);
    setConfirming(false);
    toast(t('memory.deleted'));
    navigate('/album', { replace: true });
    refresh();
  }

  // A blank line starts a new paragraph; single line breaks are kept inside it (white-space: pre-line).
  const paragraphs = memory.story.split(/\r?\n\s*\r?\n/).filter((p) => p.trim());

  return (
    <>
      {back}
      <div className="memory-page">
        <Gallery memory={memory} />

        <aside className="memory-side">
          <div className="memory-heading">
            <h1 className="memory-title">{memory.title}</h1>
            <div className="memory-when">
              <span>
                <Icon name="calendar" size={14} />
                {memoryDate(memory)}
              </span>
              {memory.place && (
                <span>
                  <Icon name="pin" size={14} />
                  {memory.place}
                </span>
              )}
            </div>
          </div>

          {!isOwner && (
            <div className="owner-note">
              <Avatar name={memory.owner.name} color="amber" />
              <span>
                {t('memory.sharedBy', { name: memory.owner.name })}
                {memory.sharedAt && (
                  <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>
                    {t('memory.sharedOn', { date: timestamp(memory.sharedAt) })}
                  </span>
                )}
              </span>
            </div>
          )}

          {paragraphs.length ? (
            <div className="story private text">
              {paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          ) : (
            <p className="story-empty">{isOwner ? t('memory.noStory') : t('memory.noStoryShared')}</p>
          )}

          <dl className="facts">
            <div>
              <dt>{t('memory.with')}</dt>
              <dd>
                {memory.people.length ? (
                  <div className="chips">
                    {memory.people.map((person) =>
                      isOwner ? (
                        <Link key={person.id} to={`/people/${person.id}`} className="chip">
                          <Avatar name={person.name} color={person.color} />
                          {person.name}
                        </Link>
                      ) : (
                        <span key={person.id} className="chip">
                          <Avatar name={person.name} color={person.color} />
                          {person.name}
                        </span>
                      ),
                    )}
                  </div>
                ) : (
                  <span className="muted">{t('memory.nobody')}</span>
                )}
              </dd>
            </div>
            <div>
              <dt>{t('memory.files')}</dt>
              <dd>
                {memory.files.length ? fileSummary(t, memory.files) : t('memory.noFiles')}
              </dd>
            </div>
            {/* The cards kept from this memory (in the Artifacts tab): only its owner keeps and sees them. */}
            {isOwner && memory.artifacts?.length > 0 && (
              <div className="kept-row">
                <dt>{t('artifacts.inMemory')}</dt>
                <dd>
                  <div className="kept-cards">
                    {memory.artifacts.map((artifact) => (
                      <Link
                        key={artifact.id}
                        to={`/artifacts?open=${artifact.id}`}
                        className={`kept-card kind-${artifact.kind}`}
                        title={artifact.title}
                      >
                        <img className="private" src={artifact.previewUrl} alt={artifact.title} loading="lazy" />
                      </Link>
                    ))}
                  </div>
                </dd>
              </div>
            )}
            {isOwner && (
              <div>
                <dt>{t('memory.savedOn')}</dt>
                <dd>{timestamp(memory.createdAt)}</dd>
              </div>
            )}
          </dl>

          {/* Anyone who can see the memory can turn it into a postcard, a stamp or a photo card. */}
          <div className="memory-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setStudio(true)}>
              <Icon name="postcard" size={15} />
              {t('cards.open')}
            </button>
            {isOwner && (
              <>
                <button type="button" className="btn btn-secondary" onClick={() => openMemory(memory)}>
                  <Icon name="pencil" size={15} />
                  {t('memory.editTitle')}
                </button>
                <button type="button" className="btn btn-danger-quiet" onClick={() => setConfirming(true)}>
                  <Icon name="trash" size={15} />
                  {t('common.delete')}
                </button>
              </>
            )}
          </div>
          {isOwner && <SharePanel memory={memory} />}
        </aside>
      </div>

      <Comments memory={memory} />

      <CardStudio memory={memory} open={studio} canKeep={isOwner} onKept={refresh} onClose={() => setStudio(false)} />

      <ConfirmDialog
        open={confirming}
        title={t('memory.confirmTitle')}
        body={[
          t('memory.confirmBody', { title: memory.title }),
          memory.artifacts?.length > 0 && t('memory.confirmArtifacts', { count: memory.artifacts.length }),
        ]
          .filter(Boolean)
          .join(' ')}
        onConfirm={remove}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}
