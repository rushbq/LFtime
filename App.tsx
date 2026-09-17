import React, { lazy, Suspense, useEffect, useState } from 'react';
import { AppFeature } from './types';
import ArmsRace from './components/ArmsRace/ArmsRace';
import TimeAssistant from './components/TimeAssistant';
import { lastInvite } from './features/transfer/lastInvite';

const RELOAD_KEY = 'lftime-chunk-reload-at';

/**
 * 重新發布後，開著舊頁面的人要載入的分塊檔（檔名含 hash）已不存在，
 * lazy 載入失敗會讓整頁空白。遇到時自動重新整理一次拿新版；
 * 短時間內已重整過仍失敗就照常拋錯，避免無限重整。
 */
const lazyPage = <T extends React.ComponentType<any>>(load: () => Promise<{ default: T }>) =>
  lazy(() => load().catch((error) => {
    let last = 0;
    try { last = Number(window.sessionStorage.getItem(RELOAD_KEY)) || 0; } catch { /* 無法記錄就不自動重整 */ }
    if (Date.now() - last > 30_000) {
      try { window.sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { throw error; }
      window.location.reload();
      return new Promise<never>(() => undefined);
    }
    throw error;
  }));

const TransferTracker = lazyPage(() => import('./features/transfer/TransferTracker'));
const AlliancePage = lazyPage(() => import('./features/transfer/AlliancePage'));

type Route =
  | { page: 'transfer'; invite: string }
  | { page: 'alliance'; invite?: string }
  | null;

const getRoute = (): Route => {
  const hash = window.location.hash;
  if (/^#\/alliance\/?$/.test(hash)) return { page: 'alliance' };
  const match = hash.match(/^#\/transfer\/([A-Za-z0-9_-]{20,128})(\/alliance)?$/);
  if (!match) return null;
  return match[2] ? { page: 'alliance', invite: match[1] } : { page: 'transfer', invite: match[1] };
};

const FEATURES: { key: AppFeature; label: string; hint: string }[] = [
  { key: AppFeature.ArmsRace, label: '軍備競賽', hint: 'arms race' },
  { key: AppFeature.TimeAssistant, label: '時間助手', hint: 'time tools' },
];

const GridIcon: React.FC = () => (
  <svg className="lb-grid" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <rect x="1" y="1" width="6" height="6" rx="1.6" />
    <rect x="9" y="1" width="6" height="6" rx="1.6" />
    <rect x="1" y="9" width="6" height="6" rx="1.6" />
    <rect x="9" y="9" width="6" height="6" rx="1.6" />
  </svg>
);

const UpIcon: React.FC = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 15.5V5M5 9.5 10 4.5 15 9.5" />
  </svg>
);

const App: React.FC = () => {
  const [feature, setFeature] = useState<AppFeature>(AppFeature.ArmsRace);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [route, setRoute] = useState<Route>(getRoute);
  const current = FEATURES.find((f) => f.key === feature)!;
  // 開選單時才讀，從賽季頁切回來也能拿到最新的邀請碼
  const savedInvite = menuOpen ? lastInvite() : null;

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (route) {
    return (
      <Suspense fallback={<div className="route-loading">Loading…</div>}>
        {route.page === 'transfer'
          ? <TransferTracker key={route.invite} inviteToken={route.invite} />
          : <AlliancePage key={route.invite ?? 'public'} inviteToken={route.invite} />}
      </Suspense>
    );
  }

  return (
    <div className="app-shell">
      <div className="launcher">
        <button
          className={'launcher-btn' + (menuOpen ? ' open' : '')}
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="切換小工具"
        >
          <GridIcon />
          <span className="lb-label">{current.label}</span>
          <span className="lb-chev">⌄</span>
        </button>

        {menuOpen && (
          <>
            <div className="launcher-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="launcher-menu" role="menu">
              <div className="lm-head">切換小工具</div>
              {FEATURES.map((f) => (
                <button
                  key={f.key}
                  role="menuitem"
                  className={'lm-item' + (f.key === feature ? ' on' : '')}
                  onClick={() => { setFeature(f.key); setMenuOpen(false); }}
                >
                  <span className="lm-txt">
                    <span className="lm-name">{f.label}</span>
                    <span className="lm-hint">{f.hint}</span>
                  </span>
                  {f.key === feature && <span className="lm-check">●</span>}
                </button>
              ))}
              {savedInvite ? (
                <a role="menuitem" className="lm-item" href={`#/transfer/${savedInvite}`} onClick={() => setMenuOpen(false)}>
                  <span className="lm-txt">
                    <span className="lm-name">賽季轉移</span>
                    <span className="lm-hint">season transfer</span>
                  </span>
                </a>
              ) : null}
              <a role="menuitem" className="lm-item" href={savedInvite ? `#/transfer/${savedInvite}/alliance` : '#/alliance'} onClick={() => setMenuOpen(false)}>
                <span className="lm-txt">
                  <span className="lm-name">聯盟名單</span>
                  <span className="lm-hint">alliance roster</span>
                </span>
              </a>
              <div className="lm-more">更多小工具陸續新增…</div>
            </div>
          </>
        )}
      </div>

      <div className="feature-body">
        {feature === AppFeature.ArmsRace ? <ArmsRace /> : <TimeAssistant />}
      </div>

      <button
        className={'to-top' + (showTop ? ' show' : '')}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="回到頂端"
      >
        <UpIcon />
      </button>
    </div>
  );
};

export default App;
