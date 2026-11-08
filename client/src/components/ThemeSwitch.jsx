import { useI18n } from '../i18n/index.jsx';
import { THEMES, useTheme } from '../theme.jsx';
import Icon from './Icon.jsx';

const ICONS = { notebook: 'book', darkroom: 'aperture' };

/** Notebook | Darkroom. Switches instantly and is remembered on this device. */
export default function ThemeSwitch() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  return (
    <div className="theme-switch" role="group" aria-label={t('theme.label')}>
      {THEMES.map((name) => (
        <button
          key={name}
          type="button"
          aria-pressed={theme === name}
          title={t(`theme.${name}`)}
          aria-label={t(`theme.${name}`)}
          onClick={() => setTheme(name)}
        >
          <Icon name={ICONS[name]} size={15} />
        </button>
      ))}
    </div>
  );
}
