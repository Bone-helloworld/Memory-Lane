import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { useComposer, useData, useFetch } from '../state.jsx';
import Icon from './Icon.jsx';
import { Avatar } from './People.jsx';
import { Skeleton } from './States.jsx';
import { useToast } from './Toast.jsx';

const COLORS = ['teal', 'amber', 'rose', 'ink'];

/**
 * "Who can see this memory" — only for its owner. Each person in your circle is a checkbox;
 * changes are saved at once. Nobody outside the circle can be added (the server enforces it),
 * and unticking someone withdraws the memory, its photos and videos immediately.
 */
export default function SharePanel({ memory }) {
  const { t } = useI18n();
  const toast = useToast();
  const { refresh } = useData();
  const { openInvite } = useComposer();
  const { data } = useFetch(`/api/memories/${memory.id}/shares`);
  const [recipients, setRecipients] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (data) setRecipients(data.recipients.map((r) => r.id));
  }, [data]);

  async function toggle(person) {
    const next = recipients.includes(person.id) ? recipients.filter((id) => id !== person.id) : [...recipients, person.id];
    setBusyId(person.id);
    try {
      const result = await api.put(`/api/memories/${memory.id}/shares`, { userIds: next });
      setRecipients(result.recipients.map((r) => r.id));
      toast(next.includes(person.id) ? t('share.added', { name: person.name }) : t('share.removed', { name: person.name }));
      refresh();
    } catch (err) {
      toast(errorMessage(t, err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  const circle = data?.circle;
  return (
    <section className="share-panel" aria-labelledby="share-title">
      <div className="share-panel-head">
        <h2 className="share-panel-title" id="share-title">
          <Icon name="users" size={17} />
          {t('share.title')}
        </h2>
        {recipients && <span className="share-hint">{t('share.count', { count: recipients.length })}</span>}
      </div>

      {!circle && <Skeleton height={46} count={2} />}

      {circle?.length === 0 && <p className="share-hint">{t('share.emptyCircle')}</p>}

      {circle?.length > 0 && recipients && (
        <div className="share-list">
          {circle.map((person) => (
            <label key={person.id} className="share-person">
              <Avatar name={person.name} color={COLORS[person.id % COLORS.length]} />
              <span className="share-person-name">{person.name}</span>
              {busyId === person.id && <span className="spinner" />}
              <span className="check">
                <input
                  type="checkbox"
                  checked={recipients.includes(person.id)}
                  onChange={() => toggle(person)}
                  disabled={busyId !== null}
                />
                <span />
              </span>
            </label>
          ))}
        </div>
      )}

      <p className="share-hint">{t('share.hint')}</p>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => openInvite({ memory: { id: memory.id, title: memory.title } })}
      >
        <Icon name="userPlus" size={15} />
        {t('share.invite')}
      </button>
    </section>
  );
}
