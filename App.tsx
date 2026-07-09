import React, { useState } from 'react';
import { AppFeature } from './types';
import ArmsRace from './components/ArmsRace/ArmsRace';
import TimeAssistant from './components/TimeAssistant';

const FEATURES: { key: AppFeature; label: string }[] = [
  { key: AppFeature.ArmsRace, label: '軍備競賽' },
  { key: AppFeature.TimeAssistant, label: '時間助手' },
];

const App: React.FC = () => {
  const [feature, setFeature] = useState<AppFeature>(AppFeature.ArmsRace);

  return (
    <div className="app-shell">
      <nav className="feature-switch" role="tablist" aria-label="功能切換">
        {FEATURES.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={feature === key}
            className={feature === key ? 'on' : ''}
            onClick={() => setFeature(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="feature-body">
        {feature === AppFeature.ArmsRace ? <ArmsRace /> : <TimeAssistant />}
      </div>
    </div>
  );
};

export default App;
