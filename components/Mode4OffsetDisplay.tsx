
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
      <h2 className="text-2xl font-semibold mb-4 text-sky-400">遊戲時差資訊</h2>
      <p className="text-sm text-gray-400 mb-6">
        這個遊戲世界的時間系統固定比現實世界時間
        <span className="font-semibold text-yellow-400"> 慢 {offsetHours} 小時</span>。
        時間以您裝置的系統時鐘為準 (應為 GMT+8)。
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="p-4 bg-gray-700 rounded-lg shadow">
          <h3 className="text-lg font-medium text-green-400 mb-2">目前現實世界時間 (GMT+8)</h3>
          <p className="text-2xl font-mono text-gray-100">{formatDateToYYYYMMDDHHMMSS(currentTime.realTime)}</p>
        </div>
        <div className="p-4 bg-gray-700 rounded-lg shadow">
          <h3 className="text-lg font-medium text-purple-400 mb-2">對應的遊戲時間</h3>
          <p className="text-2xl font-mono text-gray-100">{formatDateToYYYYMMDDHHMMSS(currentTime.gameTime)}</p>
        </div>
      </div>
      
      {/* Button for Gemini removed */}
      {/* <Button onClick={fetchGeminiTip} isLoading={isLoadingTip} disabled={isLoadingTip} className="mb-4">
        {geminiMessage ? "刷新提示" : "獲取遊戲提示"}
      </Button> */}
      
      {/* GeminiMessage component removed */}
      {/* <GeminiMessage 
        title="Gemini 遊戲小提示" 
        message={geminiMessage} 
        isLoading={isLoadingTip} 
        error={geminiError} 
      /> */}
    </div>
  );
};

export default Mode4OffsetDisplay;
