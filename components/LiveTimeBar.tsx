import React, { useEffect, useState } from 'react';
import { getRealAndGameTime, formatDateToHHMMSS } from '../services/timeUtils';

const WD = ['日', '一', '二', '三', '四', '五', '六'];
const fmtDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} 週${WD[d.getDay()]}`;

/** 常駐在分頁下方的即時時鐘：台灣時間 vs 遊戲時間，隨時可看 */
const LiveTimeBar: React.FC<{ offsetHours: number }> = ({ offsetHours }) => {
  const [t, setT] = useState(() => getRealAndGameTime(offsetHours));

  useEffect(() => {
    const id = setInterval(() => setT(getRealAndGameTime(offsetHours)), 1000);
    return () => clearInterval(id);
  }, [offsetHours]);

  return (
    <div className="clockbar">
      <div className="cb-col">
        <div className="cb-l">台灣時間</div>
        <div className="cb-t tw">{formatDateToHHMMSS(t.realTime)}</div>
        <div className="cb-d">{fmtDate(t.realTime)}</div>
      </div>
      <div className="cb-mid">
        <span className="cb-off">−{offsetHours}h</span>
        <span className="cb-off-l">遊戲較慢</span>
      </div>
      <div className="cb-col">
        <div className="cb-l">遊戲時間</div>
        <div className="cb-t game">{formatDateToHHMMSS(t.gameTime)}</div>
        <div className="cb-d">{fmtDate(t.gameTime)}</div>
      </div>
    </div>
  );
};

export default LiveTimeBar;
