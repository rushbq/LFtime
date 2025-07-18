
import React, { useState, useCallback } from 'react';
import Input from './shared/Input';
import Button from './shared/Button';
// import GeminiMessage from './shared/GeminiMessage'; // Gemini removed
import { calculateTimeDifference, formatDurationToString, formatDateToYYYYMMDDHHMMSS, stringToDate } from '../services/timeUtils';
// import { generateGeminiText } from '../services/geminiService'; // Gemini removed
import { TimeDuration } from '../types';

const getDefaultTargetTime = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(17, 0, 0, 0); // Default to 5 PM tomorrow
  // Format to YYYY-MM-DDTHH:MM as required by datetime-local
  const year = tomorrow.getFullYear();
  const month = (tomorrow.getMonth() + 1).toString().padStart(2, '0');
  const day = tomorrow.getDate().toString().padStart(2, '0');
  const hours = tomorrow.getHours().toString().padStart(2, '0');
  const minutes = tomorrow.getMinutes().toString().padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const Mode1TimeDifference: React.FC = () => {
  const [targetTimeInput, setTargetTimeInput] = useState<string>(getDefaultTargetTime());
  const [result, setResult] = useState<{ text: string; duration: TimeDuration; targetFormatted: string } | null>(null);
  // const [geminiMessage, setGeminiMessage] = useState<string | null>(null); // Gemini removed
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // const [geminiError, setGeminiError] = useState<string | null>(null); // Gemini removed
  const [inputError, setInputError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setInputError(null);
    setResult(null);
    // setGeminiMessage(null); // Gemini removed
    // setGeminiError(null); // Gemini removed

    const targetDateTime = stringToDate(targetTimeInput);
    if (!targetDateTime) {
      setInputError("日期時間格式無效。請選擇一個有效的日期和時間。");
      return;
    }

    setIsLoading(true);
    const { duration, targetDateTime: actualTargetDate, isPast } = calculateTimeDifference(targetDateTime);
    
    const formattedTargetDateTime = formatDateToYYYYMMDDHHMMSS(actualTargetDate);

    let resultText: string;
    if (isPast) {
      resultText = `目標時間 ${formattedTargetDateTime} 已在 ${formatDurationToString(duration, false)} 前經過。`;
    } else {
      if (duration.days === 0 && duration.hours === 0 && duration.minutes === 0 && duration.seconds > 0 && duration.seconds < 60) {
        resultText = `距離目標時間 ${formattedTargetDateTime} 還有 ${duration.seconds} 秒。`;
      } else if (duration.days === 0 && duration.hours === 0 && duration.minutes === 0 && duration.seconds === 0) {
        resultText = `目標時間 ${formattedTargetDateTime} 就是現在！`;
      }
      else {
         resultText = `距離目標時間 ${formattedTargetDateTime} 還有：${formatDurationToString(duration, false)}。`;
      }
    }
    setResult({ text: resultText, duration, targetFormatted: formattedTargetDateTime });
    setIsLoading(false); // Moved here as Gemini call is removed

    // Gemini logic removed
    // try {
    //   const prompt = isPast
    //     ? `一位玩家錯過了在 ${formattedTargetDateTime} 的遊戲活動。該活動已在 ${formatDurationToString(duration, false)} 前結束。請提供一句非常簡短 (最多約20個中文字)、幽默或帶有哲理的遊戲相關感言。`
    //     : `一位玩家正在等待 ${formattedTargetDateTime} 的遊戲活動。剩餘時間為 ${formatDurationToString(duration, false)}。請提供一句非常簡短 (最多約20個中文字)、鼓勵或詼諧的遊戲相關訊息。`;
      
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
  }, [targetTimeInput]);

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4 text-sky-400">計算至目標時間</h2>
      <p className="text-sm text-gray-400 mb-4">輸入一個目標日期與時間 (例如：2024-12-31 18:30)。將計算與目前時間的差異。時間以您裝置的系統時鐘為準 (應為 GMT+8)。</p>
      <Input
        label="目標日期與時間"
        type="datetime-local"
        id="targetTime"
        value={targetTimeInput}
        onChange={(e) => setTargetTimeInput(e.target.value)}
        className={inputError ? "border-red-500" : ""}
      />
      {inputError && <p className="text-red-400 text-sm mt-[-0.5rem] mb-2">{inputError}</p>}
      <Button onClick={handleSubmit} isLoading={isLoading} disabled={isLoading}>
        計算時間差
      </Button>

      {result && !isLoading && (
        <div className="mt-6 p-4 bg-gray-700 rounded-lg">
          <h3 className="text-lg font-semibold text-green-400 mb-2">計算結果</h3>
          <p className="text-gray-200">{result.text}</p>
        </div>
      )}
      {/* <GeminiMessage message={geminiMessage} isLoading={isLoading && !result} error={geminiError} title="Gemini 小提示" /> // Gemini removed */}
    </div>
  );
};

export default Mode1TimeDifference;
