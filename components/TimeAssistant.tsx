import React, { useState, useCallback } from 'react';
import './timeAssistant.css';
import { AppMode } from '../types';
import Mode1TimeDifference from './Mode1TimeDifference';
import Mode2TimeAddition from './Mode2TimeAddition';
import Mode3GameTimeConverter from './Mode3GameTimeConverter';
import LiveTimeBar from './LiveTimeBar';
import { GAME_TIME_OFFSET_HOURS } from '../constants';

const TABS: { mode: AppMode; label: string; accent: string }[] = [
  { mode: AppMode.TimeDifference, label: '時間倒數', accent: '#4d8bff' },
  { mode: AppMode.TimeAddition, label: '時間疊加', accent: '#17b6a3' },
  { mode: AppMode.GameTimeConverter, label: '時間轉換', accent: '#b56bff' },
];

const TimeAssistant: React.FC = () => {
  const [currentMode, setCurrentMode] = useState<AppMode>(AppMode.TimeDifference);
  const currentAccent = TABS.find((t) => t.mode === currentMode)!.accent;

  const renderModeContent = useCallback(() => {
    switch (currentMode) {
      case AppMode.TimeDifference:
        return <Mode1TimeDifference />;
      case AppMode.TimeAddition:
        return <Mode2TimeAddition />;
      case AppMode.GameTimeConverter:
        return <Mode3GameTimeConverter offsetHours={GAME_TIME_OFFSET_HOURS} />;
      default:
        return <p className="err-msg">錯誤：選擇了未知的模式。</p>;
    }
  }, [currentMode]);

  return (
    <div className="ta-root">
      <header>
        <div className="brand"><b>時間助手</b><span>time tools</span></div>
        <div className="brand-sub">遊戲時間換算與倒數</div>
      </header>

      <nav className="ta-tabs" role="tablist" aria-label="模式切換">
        {TABS.map(({ mode, label, accent }) => (
          <button
            key={mode}
            role="tab"
            aria-selected={currentMode === mode}
            className={'ta-tab' + (currentMode === mode ? ' on' : '')}
            style={{ ['--tab-accent' as string]: accent } as React.CSSProperties}
            onClick={() => setCurrentMode(mode)}
          >
            {label}
          </button>
        ))}
      </nav>

      <LiveTimeBar offsetHours={GAME_TIME_OFFSET_HOURS} />

      <div className="card" style={{ ['--accent' as string]: currentAccent } as React.CSSProperties}>
        {renderModeContent()}
      </div>

      <div className="foot">
        所有時間都以你手機的系統時鐘為準，請確認手機時區設為台灣。
      </div>
    </div>
  );
};

export default TimeAssistant;
