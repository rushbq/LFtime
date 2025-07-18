
import React, { useState, useCallback } from 'react';
import { AppMode } from './types';
import Mode1TimeDifference from './components/Mode1TimeDifference';
import Mode2TimeAddition from './components/Mode2TimeAddition';
import Mode3GameTimeConverter from './components/Mode3GameTimeConverter';
import Mode4OffsetDisplay from './components/Mode4OffsetDisplay';
import { GAME_TIME_OFFSET_HOURS } from './constants';

const App: React.FC = () => {
  const [currentMode, setCurrentMode] = useState<AppMode>(AppMode.TimeDifference);

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
        return <div className="text-red-400">錯誤：選擇了未知的模式。</div>;
    }
  }, [currentMode]);

  const NavButton: React.FC<{ mode: AppMode; label: string }> = ({ mode, label }) => (
    <button
      onClick={() => setCurrentMode(mode)}
      className={`px-3 py-3 text-xs sm:text-sm font-medium rounded-md transition-colors duration-150 ease-in-out
                  ${currentMode === mode 
                    ? 'bg-blue-600 text-white shadow-lg' 
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 selection:bg-blue-500 selection:text-white">
      <header className="w-full max-w-3xl mb-8 text-center">
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
          遊戲時間助手
        </h1>
        <p className="text-gray-400 mt-2">您的遊戲時間計算好夥伴！</p>
      </header>

      <nav className="w-full max-w-3xl mb-8 p-2 bg-gray-800 rounded-lg shadow-md">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <NavButton mode={AppMode.TimeDifference} label="時間倒數" />
          <NavButton mode={AppMode.TimeAddition} label="時間疊加" />
          <NavButton mode={AppMode.GameTimeConverter} label="時間轉換" />
          <NavButton mode={AppMode.OffsetDisplay} label="時差資訊" />
        </div>
      </nav>

      <main className="w-full max-w-3xl p-6 bg-gray-800 rounded-lg shadow-xl">
        {renderModeContent()}
      </main>

      <footer className="w-full max-w-3xl mt-12 text-center text-gray-500 text-sm">
        <p>請確保已設定 API_KEY 環境變數以使用 Gemini 功能。</p>
        <p>時間計算均基於您裝置的系統時鐘。為獲得準確的 GMT+8 時間，請確保您的裝置設定為 GMT+8 時區。</p>
        <p>&copy; {new Date().getFullYear()} 遊戲時間助手. 版權沒有 (開玩笑的)。</p>
      </footer>
    </div>
  );
};

export default App;
