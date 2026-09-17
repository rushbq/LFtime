import { FC, useEffect, useState } from 'react';
import { detectLang, Lang, STRINGS } from './i18n';
import { lastInvite } from './lastInvite';

/** 賽季名單與聯盟名單共用的主題、語言偏好與圖示 */

export type Theme = 'light' | 'dark';

const THEME_KEY = 'lftime-transfer-theme';
const LANG_KEY = 'lftime-transfer-lang';

const systemTheme = (): Theme =>
  window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';

const storedTheme = (): Theme | null => {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
};

const storedLang = (): Lang | null => {
  try {
    const value = window.localStorage.getItem(LANG_KEY);
    return value === 'zh' || value === 'en' ? value : null;
  } catch {
    return null;
  }
};

export const usePreferences = () => {
  const [pinnedTheme, setPinnedTheme] = useState<Theme | null>(storedTheme);
  const [followTheme, setFollowTheme] = useState<Theme>(systemTheme);
  const [lang, setLang] = useState<Lang>(() => storedLang() ?? detectLang());
  const theme = pinnedTheme ?? followTheme;

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setFollowTheme(query.matches ? 'light' : 'dark');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const toggleLang = () => {
    const next: Lang = lang === 'zh' ? 'en' : 'zh';
    setLang(next);
    try { window.localStorage.setItem(LANG_KEY, next); } catch { /* 隱私模式下不記住就算了 */ }
  };

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setPinnedTheme(next);
    try { window.localStorage.setItem(THEME_KEY, next); } catch { /* 隱私模式下不記住就算了 */ }
  };

  return { theme, toggleTheme, lang, toggleLang };
};

export const SearchIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.2 4.2" />
  </svg>
);

export const CloudIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 18.5h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.2 9.2 4.7 4.7 0 0 0 7 18.5Z" />
    <path d="m9.2 13.3 2 2 3.9-4.1" />
  </svg>
);

export const CopyIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="8" y="8" width="11" height="11" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
);

export const SunIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.6v2.1M12 19.3v2.1M4.2 4.2l1.5 1.5M18.3 18.3l1.5 1.5M2.6 12h2.1M19.3 12h2.1M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5" />
  </svg>
);

export const MoonIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" />
  </svg>
);

export const InfoIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.2M12 7.6v.1" />
  </svg>
);

export const PREVIEW_TOKEN = /^preview-(r5|r4|adm)-local-only-2609$/;

export { forgetInvite, rememberInvite } from './lastInvite';

/** 小幫手、賽季轉移、聯盟名單之間的頁籤；沒有邀請碼時不顯示賽季頁 */
export const PageTabs: FC<{ current: 'season' | 'alliance'; lang: Lang; inviteToken?: string }> = ({
  current, lang, inviteToken,
}) => {
  const t = STRINGS[lang];
  const token = inviteToken ?? lastInvite();
  const tabs = [
    { key: 'home', label: t.tabHome, href: '#' },
    ...(token ? [{ key: 'season', label: t.tabSeason, href: `#/transfer/${token}` }] : []),
    { key: 'alliance', label: t.tabAlliance, href: token ? `#/transfer/${token}/alliance` : '#/alliance' },
  ];
  return (
    <nav className="page-tabs" aria-label={t.tabsLabel}>
      {tabs.map((tab) => (
        <a key={tab.key} href={tab.href} className={tab.key === current ? 'active' : ''} aria-current={tab.key === current ? 'page' : undefined}>
          {tab.label}
        </a>
      ))}
    </nav>
  );
};

export const hashUrl = (hash: string) => `${window.location.origin}${window.location.pathname}${hash}`;
