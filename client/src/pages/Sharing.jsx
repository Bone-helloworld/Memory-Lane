import { useEffect, useState } from 'react';
import { api } from '../api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import Icon from '../components/Icon.jsx';
import { MemoryGrid } from '../components/Memories.jsx';
import PageHeader, { SectionHead } from '../components/PageHeader.jsx';
import { Avatar } from '../components/People.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/States.jsx';
import { useToast } from '../components/Toast.jsx';
import { useI18n } from '../i18n/index.jsx';
import { markSharedSeen, useComposer, useData, useFetch, usePageTitle } from '../state.jsx';

const COLORS = ['teal', 'amber', 'rose', 'ink'];

/**
 * "Chia sẻ": what others shared with you, what you shared, your circle (people connected
 * through an invite link) and the invite links you sent. One request fills the whole page.
 */
export default function Sharing() {
  const { t, timestamp, dateTime } = useI18n();
  const { refresh } = useData();
  const { openInvite } = useComposer();
  const toast = useToast();
  const { data, error, retry } = useFetch('/api/sharing');
  const [confirm, setConfirm] = useState(null); // { kind: 'person', person } | { kind: 'invite', invite }
  usePageTitle(t('sharing.title'));

  // Opening this page counts as having seen what was shared (clears the dot in the navigation).
  useEffect(() => {
    if (!data?.sharedWithMe.length) return;
    const newest = data.sharedWithMe.reduce((max, memory) => (memory.sharedAt > max ? memory.sharedAt : max), '');
    markSharedSeen(newest);
  }, [data]);

  async function confirmAction() {
    if (confirm.kind === 'person') {
      await api.del(`/api/sharing/circle/${confirm.person.id}`);
      toast(t('sharing.disconnected', { name: confirm.person.name }));
    } else {
      await api.del(`/api/invites/${confirm.invite.id}`);
      toast(t('sharing.revoked'));
    }
    setConfirm(null);
    refresh();
  }

  const inviteButton = (
    <button type="button" className="btn btn-primary" onClick={() => openInvite({})}>
      <Icon name="userPlus" size={16} />
      {t('sharing.invite')}
    </button>
  );

  if (error) return <ErrorState error={error} onRetry={retry} />;

  const pending = data?.invites.filter((invite) => invite.status === 'pending') ?? [];
  const history = data?.invites.filter((invite) => invite.status !== 'pending').slice(0, 6) ?? [];

  return (
    <>
      <PageHeader kicker={t('sharing.kicker')} title={t('sharing.title')} subtitle={t('sharing.sub')} actions={inviteButton} />

      {!data && <Skeleton height={260} count={2} />}

      {data && (
        <div className="sharing-grid">
          <div>
            <section aria-labelledby="with-me">
              <SectionHead
                kicker={t('sharing.withMeKicker')}
                title={t('sharing.withMe', { count: data.sharedWithMe.length })}
                id="with-me"
              />
              {data.sharedWithMe.length ? (
                <MemoryGrid memories={data.sharedWithMe} showOwner compact />
              ) : (
                <EmptyState art="share" compact title={t('sharing.withMeEmpty')} body={t('sharing.withMeEmptyBody')} />
              )}
            </section>

            <section className="section" aria-labelledby="by-me">
              <SectionHead kicker={t('sharing.byMeKicker')} title={t('sharing.byMe', { count: data.sharedByMe.length })} id="by-me" />
              {data.sharedByMe.length ? (
                <MemoryGrid memories={data.sharedByMe} compact />
              ) : (
                <EmptyState compact title={t('sharing.byMeEmpty')} body={t('sharing.byMeEmptyBody')} />
              )}
            </section>
          </div>

          <aside className="sharing-aside">
            <section aria-labelledby="circle-title">
              <SectionHead kicker={t('sharing.circleKicker')} title={t('sharing.circle')} id="circle-title" />
              <div className="list-card">
                {data.circle.length === 0 && <p className="list-empty">{t('sharing.circleEmpty')}</p>}
                {data.circle.map((person) => (
                  <div key={person.id} className="list-row">
                    <Avatar name={person.name} color={COLORS[person.id % COLORS.length]} />
                    <div className="list-row-main">
                      <span className="list-row-title">{person.name}</span>
                      <span className="list-row-sub">
                        {t('sharing.since', { date: timestamp(person.since) })} ·{' '}
                        {t('sharing.counts', { mine: person.sharedByMe, theirs: person.sharedWithMe })}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setConfirm({ kind: 'person', person })}
                      title={t('sharing.disconnect')}
                      aria-label={t('sharing.disconnectName', { name: person.name })}
                    >
                      <Icon name="userMinus" size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section aria-labelledby="invites-title">
              <SectionHead kicker={t('sharing.invitesKicker')} title={t('sharing.invites')} id="invites-title" />
              <div className="list-card">
                {pending.length + history.length === 0 && <p className="list-empty">{t('sharing.invitesEmpty')}</p>}
                {[...pending, ...history].map((invite) => (
                  <div key={invite.id} className="list-row">
                    <Icon name="link" size={16} />
                    <div className="list-row-main">
                      <span className="list-row-title">{invite.label || invite.person?.name || t('sharing.inviteUntitled')}</span>
                      <span className="list-row-sub">
                        {invite.status === 'accepted' && invite.acceptedBy
                          ? t('sharing.acceptedBy', { name: invite.acceptedBy.name, date: timestamp(invite.acceptedAt) })
                          : invite.status === 'pending'
                            ? t('sharing.expires', { date: dateTime(invite.expiresAt) })
                            : t('sharing.createdOn', { date: timestamp(invite.createdAt) })}
                        {invite.memory && ` · ${invite.memory.title}`}
                      </span>
                    </div>
                    <span className={`status ${invite.status}`}>{t(`sharing.status.${invite.status}`)}</span>
                    {invite.status === 'pending' && (
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setConfirm({ kind: 'invite', invite })}
                        title={t('sharing.revoke')}
                        aria-label={t('sharing.revoke')}
                      >
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="panel" aria-labelledby="how-title">
              <h2 className="panel-title" id="how-title">
                {t('sharing.howTitle')}
              </h2>
              <ol className="how-list">
                <li>{t('sharing.how1')}</li>
                <li>{t('sharing.how2')}</li>
                <li>{t('sharing.how3')}</li>
                <li>{t('sharing.how4')}</li>
              </ol>
            </section>
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.kind === 'person'
            ? t('sharing.disconnectTitle', { name: confirm.person.name })
            : t('sharing.revokeTitle')
        }
        body={
          confirm?.kind === 'person' ? t('sharing.disconnectBody', { name: confirm.person.name }) : t('sharing.revokeBody')
        }
        confirmLabel={confirm?.kind === 'person' ? t('sharing.disconnect') : t('sharing.revoke')}
        onConfirm={confirmAction}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}
