import { Link } from 'react-router';
import Brand from '../components/Brand.jsx';
import Icon from '../components/Icon.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';
import { Collage } from '../components/Memories.jsx';
import ThemeSwitch from '../components/ThemeSwitch.jsx';
import { useI18n } from '../i18n/index.jsx';

/** Split screen used by login, register and the invite page: photos on the left, the form on the right. */
export default function AuthLayout({ children }) {
  const { t } = useI18n();
  return (
    <div className="auth">
      <aside className="auth-art">
        <Brand />
        <Collage />
        <div>
          <p className="auth-quote">
            {t('auth.quoteA')} <em>{t('auth.quoteB')}</em>
          </p>
          <p className="auth-note">{t('auth.note')}</p>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-top">
          <Link to="/" className="back-link">
            <Icon name="arrowLeft" size={14} />
            {t('auth.backHome')}
          </Link>
          <div className="auth-tools">
            <ThemeSwitch />
            <LanguageToggle />
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
