import { Link } from 'react-router';
import { toISODate } from '@shared/dates.js';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icon.jsx';
import { Featured, MemoryGrid, Strip, YearBar } from '../components/Memories.jsx';
import { SectionHead } from '../components/PageHeader.jsx';
import { PersonRow } from '../components/People.jsx';
import Reel from '../components/Reel.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/States.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useComposer, useFetch, usePageTitle } from '../state.jsx';

// Heading for each kind of film strip the server can return.
const FILM_HEADINGS = {
  day: ['today.film.dayEyebrow', 'today.film.dayTitle'],
  month: ['today.film.monthEyebrow', 'today.film.monthTitle'],
  random: ['today.film.randomEyebrow', 'today.film.randomTitle'],
  empty: ['today.film.emptyEyebrow', 'today.film.emptyTitle'],
};

function greetingKey(hour) {
  if (hour < 12) return 'greeting.morning';
  if (hour < 18) return 'greeting.afternoon';
  return 'greeting.evening';
}

/** Puts a name in bold inside a translated sentence, whatever the word order of the language. */
function withBoldName(t, key, vars) {
  const MARK = '\u0000';
  const [before, after] = t(key, { ...vars, name: MARK }).split(MARK);
  return (
    <>
      {before}
      <strong>{vars.name}</strong>
      {after}
    </>
  );
}

/** "Hôm nay gợi lại" — everything for the start page in one request. */
export default function Today() {
  const { t, todayLine, number } = useI18n();
  const { user } = useAuth();
  const { openMemory } = useComposer();
  const { data, error, retry } = useFetch(`/api/dashboard/today?today=${toISODate()}`);
  usePageTitle(t('nav.today'));

  const greeting = t(greetingKey(new Date().getHours()), { name: '\u0000' }).split('\u0000');

  if (error) return <ErrorState error={error} onRetry={retry} />;
  if (!data) {
    return (
      <div className="skeleton-stack">
        <Skeleton height={380} radius={8} />
        <Skeleton height={220} />
        <Skeleton height={76} count={3} />
      </div>
    );
  }

  return (
    <>
      <section className="today-hero" aria-labelledby="today-title">
        <div className="today-intro">
          <span className="kicker">{todayLine()}</span>
          <h1 className="page-title" id="today-title">
            {greeting[0]}
            <span className="mark">{user.name}</span>
            {greeting[1]}
          </h1>
          <p className="today-lede">{t('hero.sub')}</p>
          <div className="stats">
            {['memories', 'people', 'media'].map((key) => (
              <p key={key} className="stat">
                <span className="stat-num">{number(data.stats[key])}</span>
                <span className="stat-label">{t(`hero.stats.${key}`, { count: data.stats[key] })}</span>
              </p>
            ))}
          </div>
        </div>
        <Featured memory={data.featured} />
      </section>

      {data.years.length > 0 && (
        <div className="section" style={{ marginTop: 56 }}>
          <YearBar years={data.years} active={null} linkTo="/album" />
        </div>
      )}

      <section className="section" style={{ marginTop: 40 }}>
        <SectionHead kicker={t(FILM_HEADINGS[data.filmstrip.mode][0])} title={t(FILM_HEADINGS[data.filmstrip.mode][1])}>
          {data.filmstrip.mode !== 'empty' && (
            <Link to="/album" className="link-more">
              {t('today.film.seeAlbum')}
            </Link>
          )}
        </SectionHead>
        {data.filmstrip.mode === 'empty' ? (
          <EmptyState
            title={t('today.film.emptyTitle')}
            body={t('today.film.emptyBody')}
            action={
              <button type="button" className="btn btn-primary" onClick={() => openMemory()}>
                <Icon name="plus" size={15} />
                {t('album.emptyCta')}
              </button>
            }
          />
        ) : (
          <Strip items={data.filmstrip.items} />
        )}
      </section>

      {data.sharedWithMe.length > 0 && (
        <section className="section">
          <SectionHead kicker={t('today.shared.kicker')} title={t('today.shared.title')}>
            <Link to="/sharing" className="link-more">
              {t('today.shared.all')}
            </Link>
          </SectionHead>
          <MemoryGrid memories={data.sharedWithMe} showOwner compact />
        </section>
      )}

      <section className="section">
        <SectionHead kicker={t('today.people.eyebrow')} title={t('today.people.title')}>
          <Link to="/people?new=1" className="link-more">
            {t('today.people.add')}
          </Link>
        </SectionHead>
        {data.suggestion && (
          <div className="owner-note" style={{ marginBottom: 18 }}>
            <Icon name="sparkle" size={18} />
            <span style={{ flex: 1 }}>
              {withBoldName(t, 'suggestion.text', { name: data.suggestion.person.name, count: data.suggestion.years })}
            </span>
            <Link className="btn btn-secondary btn-sm" to={`/people/${data.suggestion.person.id}#notes`}>
              {t('suggestion.cta')}
            </Link>
          </div>
        )}
        {data.people.length ? (
          <div className="people-list">
            {data.people.map((person) => (
              <PersonRow key={person.id} person={person} />
            ))}
          </div>
        ) : (
          <EmptyState compact title={t('today.people.emptyTitle')} body={t('today.people.emptyBody')} />
        )}
      </section>

      <section className="section">
        <SectionHead kicker={t('today.media.eyebrow')} title={t('today.media.title')}>
          <Link to="/archive?new=1" className="link-more">
            {t('today.media.add')}
          </Link>
        </SectionHead>
        {data.media.length ? (
          <div className="reels">
            {data.media.map((item, index) => (
              <Reel key={item.id} item={item} index={index} />
            ))}
          </div>
        ) : (
          <EmptyState compact title={t('today.media.emptyTitle')} body={t('today.media.emptyBody')} />
        )}
      </section>
    </>
  );
}
