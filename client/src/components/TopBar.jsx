import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router';
import { LIMITS } from '@shared/limits.js';
import { toISODate } from '@shared/dates.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useFetch, useSeenShared } from '../state.jsx';
import { useTheme } from '../theme.jsx';
import Brand from './Brand.jsx';
import Icon from './Icon.jsx';
import LanguageToggle from './LanguageToggle.jsx';
import { Avatar } from './People.jsx';
import ThemeSwitch from './ThemeSwitch.jsx';
import { useToast } from './Toast.jsx';

export const NAV = [
  { to: '/today', key: 'today' },
  { to: '/album', key: 'album' },
  { to: '/people', key: 'people' },
  { to: '/sharing', key: 'sharing' },
  { to: '/archive', key: 'archive' },
  { to: '/artifacts', key: 'artifacts' },
  { to: '/timeline', key: 'timeline' },
];

const pad = (n) => String(n).padStart(2, '0');

/** The logged-in navigation: brand, seven spaces, search, "new memory", theme, language, account. */
export default function TopBar({ onNew }) {
  const { t, locale } = useI18n();
  const { theme } = useTheme();
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const bar = useRef(null);
  // Counters + "something new was shared with you" (compared with what this device has seen).
  const { data } = useFetch(`/api/dashboard/summary?today=${toISODate()}`);
  const seen = useSeenShared();
  const hasNewShared = Boolean(data?.latestSharedAt && data.latestSharedAt > seen);

  useEffect(() => setSheetOpen(false), [location.pathname]);
  useNavFit(bar, [theme, locale, hasNewShared]);

  return (
    <header className="topbar">
      <div className="topbar-inner" ref={bar}>
        <Brand to="/today" />
        <nav className="tabs" aria-label={t('nav.main')}>
          <NavItems hasNewShared={hasNewShared} />
        </nav>
        <div className="topbar-tools">
          <SearchBox key={location.pathname === '/search' ? location.search : 'search'} />
          <button type="button" className="btn btn-primary btn-new" onClick={onNew} title={t('nav.newMemory')}>
            <Icon name="plus" size={16} strokeWidth={2} />
            <span className="label">{t('nav.newShort')}</span>
          </button>
          <ThemeSwitch />
          <LanguageToggle />
          <UserMenu />
          <button
            type="button"
            className="icon-btn menu-btn"
            onClick={() => setSheetOpen(true)}
            aria-label={t('nav.openMenu')}
            aria-expanded={sheetOpen}
          >
            <Icon name="menu" size={21} />
          </button>
        </div>
      </div>
      <MobileSheet open={sheetOpen} onClose={() => setSheetOpen(false)} hasNewShared={hasNewShared} />
    </header>
  );
}

/**
 * Chooses the roomiest top bar that fits on one line. How much room the tabs need depends on the
 * theme's fonts, the language and the window width, so it is measured instead of guessed with fixed
 * breakpoints (which is how tabs once ended up on top of the search box after a theme switch).
 * Steps are cumulative and written into data-fit, an attribute React does not manage:
 *   1 hide the tab numbers · 2 compact tabs + icon-only "new" button ·
 *   3 theme & language move into the account menu · 4 menu button only (as on phones).
 */
const FIT_STEPS = 4;

function useNavFit(ref, deps) {
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return undefined;
    const tabs = bar.querySelector('.tabs');
    const overflowing = () => tabs.scrollWidth > tabs.clientWidth + 1 || bar.scrollWidth > bar.clientWidth + 1;
    const fit = () => {
      const steps = [];
      bar.dataset.fit = '';
      while (steps.length < FIT_STEPS && overflowing()) {
        steps.push(steps.length + 1);
        bar.dataset.fit = steps.join(' ');
      }
    };
    fit();
    // Re-measure when the window is resized and when a web font finishes loading.
    const observer = new ResizeObserver(fit);
    observer.observe(bar);
    document.fonts?.addEventListener('loadingdone', fit);
    return () => {
      observer.disconnect();
      document.fonts?.removeEventListener('loadingdone', fit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function NavItems({ hasNewShared }) {
  const { t } = useI18n();
  return NAV.map((item, index) => (
    <NavLink key={item.to} to={item.to} className="tab">
      <span className="tab-no" aria-hidden="true">
        {pad(index + 1)}
      </span>
      <span className="tab-label">{t(`nav.tabs.${item.key}`)}</span>
      {item.key === 'sharing' && hasNewShared && (
        <span className="tab-badge" title={t('nav.newShared')}>
          {t('nav.new')}
          <span className="visually-hidden">: {t('nav.newShared')}</span>
        </span>
      )}
    </NavLink>
  ));
}

/** Compact search box; grows while typing. Accents optional ("da lat" finds "Đà Lạt"). */
export function SearchBox({ onDone }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(location.pathname === '/search' ? (params.get('q') ?? '') : '');

  function submit(event) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate(`/search?q=${encodeURIComponent(q)}`);
    onDone?.();
  }

  return (
    <form role="search" className="search" onSubmit={submit}>
      <Icon name="search" size={15} />
      <input
        className="search-input"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('search.placeholder')}
        aria-label={t('search.label')}
        maxLength={LIMITS.searchQuery}
      />
    </form>
  );
}

function useLogout() {
  const { t } = useI18n();
  const { logout } = useAuth();
  const toast = useToast();
  return async () => {
    await logout();
    toast(t('nav.loggedOut'));
  };
}

/** Avatar button → settings, export, log out. Closes on Esc, outside click and navigation. */
function UserMenu() {
  const { t } = useI18n();
  const { user } = useAuth();
  const location = useLocation();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const button = useRef(null);

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={root}>
      <button
        ref={button}
        type="button"
        className="user-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('nav.account')}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar name={user.name} color="ink" />
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="menu-pop" role="menu" aria-label={t('nav.account')}>
          <div className="menu-head">
            <b>{user.name}</b>
            <span>{user.email}</span>
          </div>
          {/* Shown only when the top bar is too narrow for these two toggles (data-fit step 3). */}
          <div className="menu-prefs">
            <div className="menu-row">
              <span>{t('theme.label')}</span>
              <ThemeSwitch />
            </div>
            <div className="menu-row">
              <span>{t('lang.label')}</span>
              <LanguageToggle />
            </div>
            <div className="menu-sep" />
          </div>
          <Link role="menuitem" className="menu-item" to="/settings">
            <Icon name="lock" size={16} />
            {t('nav.settings')}
          </Link>
          {/* A normal link: the browser downloads the JSON file with the session cookie. */}
          <a role="menuitem" className="menu-item" href="/api/me/export" download>
            <Icon name="download" size={16} />
            {t('nav.export')}
          </a>
          <div className="menu-sep" />
          <button role="menuitem" type="button" className="menu-item" onClick={logout}>
            <Icon name="logout" size={16} />
            {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

/** Phones and small windows: the whole navigation in a full-screen sheet. */
function MobileSheet({ open, onClose, hasNewShared }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const logout = useLogout();
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={t('nav.main')}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return; // only the dialog's own Esc
        event.preventDefault();
        onClose();
      }}
    >
      {open && (
        <div className="sheet-inner">
          <div className="sheet-top">
            <Brand to="/today" />
            <button type="button" className="icon-btn" onClick={onClose} aria-label={t('nav.closeMenu')}>
              <Icon name="close" size={20} />
            </button>
          </div>
          <SearchBox onDone={onClose} />
          <nav className="sheet-nav" aria-label={t('nav.main')}>
            <NavItems hasNewShared={hasNewShared} />
          </nav>
          <div className="sheet-tools">
            <div className="row">
              <span>{t('theme.label')}</span>
              <ThemeSwitch />
            </div>
            <div className="row">
              <span>{t('lang.label')}</span>
              <LanguageToggle />
            </div>
            <div className="menu-sep" />
            <div className="row">
              <span>
                <b style={{ color: 'var(--text)' }}>{user.name}</b>
                <br />
                {user.email}
              </span>
            </div>
            <Link className="menu-item" to="/settings">
              <Icon name="lock" size={16} />
              {t('nav.settings')}
            </Link>
            <a className="menu-item" href="/api/me/export" download>
              <Icon name="download" size={16} />
              {t('nav.export')}
            </a>
            <button type="button" className="menu-item" onClick={logout}>
              <Icon name="logout" size={16} />
              {t('nav.logout')}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
