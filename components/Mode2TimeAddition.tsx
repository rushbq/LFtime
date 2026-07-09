
import React, { useState, useCallback } from 'react';
import Input from './shared/Input';
import Button from './shared/Button';
// import GeminiMessage from './shared/GeminiMessage'; // Gemini removed
import { addDurationToCurrent, formatDateToYYYYMMDDHHMMSS, formatDurationToString } from '../services/timeUtils';
// import { generateGeminiText } from '../services/geminiService'; // Gemini removed
import { TimeDuration } from '../types';

const Mode2TimeAddition: React.FC = () => {
  const [days, setDays] = useState<string>('0');
  const [hours, setHours] = useState<string>('0');
  const [minutes, setMinutes] = useState<string>('0');
  const [seconds, setSeconds] = useState<string>('0');
  
  const [resultTime, setResultTime] = useState<string | null>(null);
  // const [geminiMessage, setGeminiMessage] = useState<string | null>(null); // Gemini removed
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // const [geminiError, setGeminiError] = useState<string | null>(null); // Gemini removed
  const [inputError, setInputError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setInputError(null);
    setResultTime(null);
    // setGeminiMessage(null); // Gemini removed
    // setGeminiError(null); // Gemini removed

    const d = parseInt(days, 10);
    const h = parseInt(hours, 10);
    const m = parseInt(minutes, 10);
    const s = parseInt(seconds, 10);

    if (isNaN(d) || isNaN(h) || isNaN(m) || isNaN(s) || d < 0 || h < 0 || m < 0 || s < 0) {
      setInputError("所有期間數值必須是非負數。");
      return;
    }
    if (d === 0 && h === 0 && m === 0 && s === 0) {
      setInputError("請輸入大於零的期間。");
      return;
    }

    setIsLoading(true);
    const futureTime = addDurationToCurrent(d, h, m, s);
    const formattedFutureTime = formatDateToYYYYMMDDHHMMSS(futureTime);
    setResultTime(formattedFutureTime);
    setIsLoading(false); // Moved here as Gemini call is removed

    // const durationInput: TimeDuration = { days: d, hours: h, minutes: m, seconds: s }; // Not needed without Gemini

    // Gemini logic removed
    // try {
    //   const prompt = `一個遊戲活動預計在從現在開始加上 ${formatDurationToString(durationInput, true)} 之後舉行。活動時間將是 ${formattedFutureTime}。請為這個即將到來的活動提供一句非常簡短 (最多約20個中文字)、令人興奮或具準備性的遊戲相關訊息。`;
    //   const gptResponse = await generateGeminiText(prompt);
    //   if (gptResponse.startsWith("Error:")) {
    //     setGeminiError(gptResponse);
    //   } else {
    //     setGeminiMessage(gptResponse);
    //   }
    // } catch (e) {
    //   console.error(e);
    //   setGeminiError("無法從 Gemini 獲取建議。");
    // } finally {
    //   setIsLoading(false);
    // }
  }, [days, hours, minutes, seconds]);

  return (
    <div>
      <div className="sec-head"><span className="k">02</span><h2>將期間加到目前時間</h2><div className="rule" /></div>
      <p className="desc">輸入要加到目前時間的期間，計算後顯示未來的日期與時間。時間以裝置系統時鐘為準（應為 GMT+8）。</p>

      <div className="num-grid">
        <Input label="天" type="number" id="days" value={days} onChange={(e) => setDays(e.target.value)} min="0" />
        <Input label="小時" type="number" id="hours" value={hours} onChange={(e) => setHours(e.target.value)} min="0" />
        <Input label="分鐘" type="number" id="minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)} min="0" />
        <Input label="秒" type="number" id="seconds" value={seconds} onChange={(e) => setSeconds(e.target.value)} min="0" />
      </div>
      {inputError && <p className="err-msg">{inputError}</p>}

      <Button onClick={handleSubmit} isLoading={isLoading} disabled={isLoading}>
        計算未來時間
      </Button>

      {resultTime && !isLoading && (
        <div className="result">
          <div className="rlabel">未來時間</div>
          <div className="rval mono">{resultTime}</div>
        </div>
      )}
    </div>
  );
};

export default Mode2TimeAddition;
