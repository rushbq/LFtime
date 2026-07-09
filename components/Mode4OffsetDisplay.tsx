
import React, { useState, useEffect } from 'react'; // useCallback removed
import { getRealAndGameTime, formatDateToYYYYMMDDHHMMSS } from '../services/timeUtils';
// import { generateGeminiText } from '../services/geminiService'; // Gemini removed
// import GeminiMessage from './shared/GeminiMessage'; // Gemini removed
// import Button from './shared/Button';  // Button for Gemini removed

interface Mode4Props {
  offsetHours: number;
}

const Mode4OffsetDisplay: React.FC<Mode4Props> = ({ offsetHours }) => {
  const [currentTime, setCurrentTime] = useState(getRealAndGameTime(offsetHours));
  // const [geminiMessage, setGeminiMessage] = useState<string | null>(null); // Gemini removed
  // const [isLoadingTip, setIsLoadingTip] = useState<boolean>(false); // Gemini removed
  // const [geminiError, setGeminiError] = useState<string | null>(null); // Gemini removed

  useEffect(() => {
    const timerId = setInterval(() => {
      setCurrentTime(getRealAndGameTime(offsetHours));
    }, 1000);
    return () => clearInterval(timerId);
  }, [offsetHours]);

  // Gemini logic removed
  // const fetchGeminiTip = useCallback(async () => {
  //   setIsLoadingTip(true);
  //   setGeminiMessage(null);
  //   setGeminiError(null);
  //   try {
  //     const prompt = `遊戲時間固定比現實世界時間慢 ${offsetHours} 小時。請為需要處理這種現實與遊戲世界固定時差的玩家，提供一個非常簡短 (最多約20個中文字) 的通用技巧或有趣小知識。`;
  //     const gptResponse = await generateGeminiText(prompt);
  //     if (gptResponse.startsWith("Error:")) {
  //       setGeminiError(gptResponse);
  //     } else {
  //       setGeminiMessage(gptResponse);
  //     }
  //   } catch (e) {
  //     console.error(e);
  //     setGeminiError("無法從 Gemini 獲取提示。");
  //   } finally {
  //     setIsLoadingTip(false);
  //   }
  // }, [offsetHours]);

  //  useEffect(() => {
  //   fetchGeminiTip();
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, []);


  return (
    <div>
      <div className="sec-head"><span className="k">04</span><h2>遊戲時差資訊</h2><div className="rule" /></div>
      <p className="desc">
        這個遊戲世界的時間固定比現實世界 <em>慢 {offsetHours} 小時</em>。時間以裝置系統時鐘為準（應為 GMT+8）。
      </p>

      <div className="live">
        <div className="b alt">
          <div className="l">目前現實世界時間 (GMT+8)</div>
          <div className="v">{formatDateToYYYYMMDDHHMMSS(currentTime.realTime)}</div>
        </div>
        <div className="b">
          <div className="l">對應的遊戲時間</div>
          <div className="v">{formatDateToYYYYMMDDHHMMSS(currentTime.gameTime)}</div>
        </div>
      </div>
    </div>
  );
};

export default Mode4OffsetDisplay;
