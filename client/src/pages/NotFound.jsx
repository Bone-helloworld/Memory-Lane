import { Link } from 'react-router';
import Icon from '../components/Icon.jsx';
import { EmptyState } from '../components/States.jsx';
import { useI18n } from '../i18n/index.jsx';
import { usePageTitle } from '../state.jsx';

/** Unknown URL. */
export default function NotFound() {
  const { t } = useI18n();
  usePageTitle(t('notFound.title'));
  return (
    <main className="notfound">
      <div className="notfound-inner">
        <span className="notfound-code">404</span>
        <h1>{t('notFound.title')}</h1>
        <p>{t('notFound.body')}</p>
        <Link to="/" className="btn btn-primary">
          <Icon name="arrowLeft" size={15} />
          {t('notFound.home')}
        </Link>
      </div>
    </main>
  );
}

/**
 * Inside the app: a memory or person that does not exist *or belongs to someone else*.
 * The API answers 404 in both cases, so nobody can probe which ids exist.
 */
export function MissingPage({ backTo, backLabel }) {
  const { t } = useI18n();
  usePageTitle(t('notFound.title'));
  return (
    <>
      <Link to={backTo} className="back-link">
        <Icon name="arrowLeft" size={14} />
        {backLabel}
      </Link>
      <EmptyState art="search" title={t('notFound.title')} body={t('errors.NOT_FOUND')} />
    </>
  );
}
