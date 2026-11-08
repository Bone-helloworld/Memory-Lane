import { Link } from 'react-router';
import { useI18n } from '../i18n/index.jsx';
import { contactStatus, initials } from '../lib/people.js';
import Icon from './Icon.jsx';

export function Avatar({ name, color = 'teal', className = '' }) {
  return (
    <span className={`avatar ${color} ${className}`.trim()} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** Five dots for "closeness", as in the mockup. */
export function ClosenessDots({ value }) {
  const { t } = useI18n();
  return (
    <span className="dots" role="img" aria-label={t('people.closeness', { value })}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? 'on' : undefined} />
      ))}
    </span>
  );
}

export function ContactTag({ lastContact }) {
  const { t } = useI18n();
  const status = contactStatus(lastContact);
  return <span className={`tag ${status.tone}`}>{t(status.key, { count: status.count })}</span>;
}

/** One row of the "Old friends" list: an index card in the notebook, a line of the index in the darkroom. */
export function PersonRow({ person }) {
  const { t, monthYear } = useI18n();
  const meta = [person.relation, person.lastContact && t('people.lastContact', { date: monthYear(person.lastContact) })]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="person-row">
      <Avatar name={person.name} color={person.color} />
      <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
        <Link to={`/people/${person.id}`} className="person-name">
          {person.name}
          {person.linked && (
            <span className="linked-badge" title={t('person.linkedTitle', { name: person.linked.name })}>
              <Icon name="link" size={12} />
              {t('people.onApp')}
            </span>
          )}
        </Link>
        {meta && <div className="person-meta">{meta}</div>}
      </div>
      <ClosenessDots value={person.closeness} />
      <ContactTag lastContact={person.lastContact} />
      <Link to={`/people/${person.id}#notes`} className="btn btn-quiet btn-sm">
        {t('people.notes')}
      </Link>
    </article>
  );
}
