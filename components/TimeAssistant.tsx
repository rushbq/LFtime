import React, { useState, useCallback } from 'react';
import './timeAssistant.css';
import { AppMode } from '../types';
import Mode1TimeDifference from './Mode1TimeDifference';
import Mode2TimeAddition from './Mode2TimeAddition';
import Mode3GameTimeConverter from './Mode3GameTimeConverter';
import Mode4OffsetDisplay from './Mode4OffsetDisplay';
import { GAME_TIME_OFFSET_HOURS } from '../constants';

const TABS: { mode: AppMode; label: string; accent: string }[] = [
  { mode: AppMode.TimeDifference, label: '時間倒數', accent: '#4d8bff' },
  { mode: AppMode.TimeAddition, label: '時間疊加', accent: '#17b6a3' },
  { mode: AppMode.GameTimeConverter, label: '時間轉換', accent: '#b56bff' },
  { mode: AppMode.OffsetDisplay, label: '時差資訊', accent: '#f0a020' },
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
      case AppMode.OffsetDisplay:
        return <Mode4OffsetDisplay offsetHours={GAME_TIME_OFFSET_HOURS} />;
      default:
        return <p className="err-msg">錯誤：選擇了未知的模式。</p>;
    }
  }, [currentMode]);

  return (
    <div className="ta-root">
      <header>
        <div className="brand"><b>時間助手</b><span>time tools</span></div>
        <div className="brand-sub">計算擾人的遊戲時間差</div>
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

      <div className="card" style={{ ['--accent' as string]: currentAccent } as React.CSSProperties}>
        {renderModeContent()}
      </div>

      <div className="foot">
        時間計算均基於您裝置的系統時鐘。為獲得準確的 GMT+8 時間，請確保裝置設定為 GMT+8 時區。
      </div>
    </div>
  );
};

export default TimeAssistant;
