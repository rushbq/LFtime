import React, { useEffect, useState } from 'react';
import { AppFeature } from './types';
import ArmsRace from './components/ArmsRace/ArmsRace';
import TimeAssistant from './components/TimeAssistant';

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

const App: React.FC = () => {
  const [feature, setFeature] = useState<AppFeature>(AppFeature.ArmsRace);
  const [menuOpen, setMenuOpen] = useState(false);
  const current = FEATURES.find((f) => f.key === feature)!;

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

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
              <div className="lm-more">更多小工具陸續新增…</div>
            </div>
          </>
        )}
      </div>

      <div className="feature-body">
        {feature === AppFeature.ArmsRace ? <ArmsRace /> : <TimeAssistant />}
      </div>
    </div>
  );
};

export default App;
