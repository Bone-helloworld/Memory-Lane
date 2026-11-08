import { LOCALES } from '@shared/limits.js';
import { useAuth } from '../auth.jsx';
import { LANGUAGE_NAMES, useI18n } from '../i18n/index.jsx';

/**
 * VI | EN switch. Changes the interface instantly (no reload), remembers the choice
 * on this device and — when logged in — saves it to the account too.
 */
export default function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const { user, saveLocale } = useAuth();

  function choose(next) {
    if (next === locale) return;
    setLocale(next);
    if (user) saveLocale(next);
  }

  return (
    <div className="lang-toggle" role="group" aria-label={t('lang.label')}>
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={locale === code}
          title={LANGUAGE_NAMES[code]}
          onClick={() => choose(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
