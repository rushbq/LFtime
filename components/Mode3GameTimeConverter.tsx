
import React, { useState, useCallback } from 'react';
import Input from './shared/Input';
import Button from './shared/Button';
// import GeminiMessage from './shared/GeminiMessage'; // Gemini removed
import { 
  convertGameTimeToRealTime, 
  convertRealTimeToGameTime, 
  formatDateToYYYYMMDDHHMMSS, 
  stringToDate,
  calculateTimeDifference,
  formatDurationToString
} from '../services/timeUtils';
// import { generateGeminiText } from '../services/geminiService'; // Gemini removed
import { ConversionDirection } from '../types';

interface Mode3Props {
  offsetHours: number;
}

const getDefaultInputTime = () => {
  const today = new Date();
  today.setHours(10, 0, 0, 0); // Default to 10 AM today
  // Format to YYYY-MM-DDTHH:MM
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  const hours = today.getHours().toString().padStart(2, '0');
  const minutes = today.getMinutes().toString().padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};


const Mode3GameTimeConverter: React.FC<Mode3Props> = ({ offsetHours }) => {
  const [timeInputString, setTimeInputString] = useState<string>(getDefaultInputTime());
  const [conversionResult, setConversionResult] = useState<{ formattedResultTime: string; timeDifferenceResult?: string } | null>(null);
  // const [geminiMessage, setGeminiMessage] = useState<string | null>(null); // Gemini removed
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // const [geminiError, setGeminiError] = useState<string | null>(null); // Gemini removed
  const [inputError, setInputError] = useState<string | null>(null);
  const [direction, setDirection] = useState<ConversionDirection>(ConversionDirection.GameToReal);

  const toggleDirection = () => {
    setDirection(prev => prev === ConversionDirection.GameToReal ? ConversionDirection.RealToGame : ConversionDirection.GameToReal);
    setTimeInputString(getDefaultInputTime()); // Reset input example on toggle
    setConversionResult(null);
    // setGeminiMessage(null); // Gemini removed
    setInputError(null);
  };

  const handleSubmit = useCallback(async () => {
    setInputError(null);
    setConversionResult(null);
    // setGeminiMessage(null); // Gemini removed
    // setGeminiError(null); // Gemini removed

    const inputDateTime = stringToDate(timeInputString);
    if (!inputDateTime) {
      setInputError("日期時間格式無效。請選擇一個有效的日期和時間。");
      return;
    }

    setIsLoading(true);
    let resultDate: Date;
    let timeDifferenceResult: string | undefined = undefined;
    // let prompt: string; // Gemini removed

    if (direction === ConversionDirection.GameToReal) {
      resultDate = convertGameTimeToRealTime(inputDateTime, offsetHours);
      
      const { duration, isPast } = calculateTimeDifference(resultDate);

      if (isPast) {
        const formattedDuration = formatDurationToString(duration, false);
        timeDifferenceResult = `(該時間點已在 ${formattedDuration} 前經過)`;
      } else {
        if (duration.days === 0 && duration.hours === 0 && duration.minutes === 0 && duration.seconds === 0) {
            timeDifferenceResult = `(就是現在！)`;
        } else if (duration.days === 0 && duration.hours === 0 && duration.minutes === 0 && duration.seconds < 60) {
            timeDifferenceResult = `(距離現在還有 ${duration.seconds} 秒)`;
        } else {
            const formattedDuration = formatDurationToString(duration, false);
            timeDifferenceResult = `(距離現在還有 ${formattedDuration})`;
        }
      }
      // prompt = `遊戲內時鐘顯示 ${formatDateToYYYYMMDDHHMMSS(inputDateTime)}。考量到遊戲世界比現實慢 ${offsetHours} 小時，這對應到現實時間 ${formatDateToYYYYMMDDHHMMSS(resultDate)}。請針對這種時間同步或差異，提供一句非常簡短 (最多約20個中文字)、古怪或觀察性的遊戲相關評論。`;
    } else { // RealToGame
      resultDate = convertRealTimeToGameTime(inputDateTime, offsetHours);
      // prompt = `現實時間是 ${formatDateToYYYYMMDDHHMMSS(inputDateTime)}。考量到遊戲世界比現實慢 ${offsetHours} 小時，這對應到遊戲時間 ${formatDateToYYYYMMDDHHMMSS(resultDate)}。請針對這種時間轉換，提供一句非常簡短 (最多約20個中文字)、關於規劃或預測的遊戲相關評論。`;
    }
    
    const formattedResultTime = formatDateToYYYYMMDDHHMMSS(resultDate);
    setConversionResult({ formattedResultTime, timeDifferenceResult });
    setIsLoading(false); // Moved here

    // Gemini logic removed
    // try {
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
  }, [timeInputString, offsetHours, direction]);

  const currentInputLabel = direction === ConversionDirection.GameToReal ? "遊戲日期與時間" : "現實日期與時間";
  const currentResultLabel = direction === ConversionDirection.GameToReal ? "對應的現實世界時間" : "對應的遊戲時間";
  const buttonLabel = direction === ConversionDirection.GameToReal ? "轉換為現實時間" : "轉換為遊戲時間";
  const titleLabel = direction === ConversionDirection.GameToReal ? "遊戲時間 → 現實時間" : "現實時間 → 遊戲時間";


  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold text-sky-400">{titleLabel}</h2>
        <Button onClick={toggleDirection} variant="secondary" className="text-sm py-1 px-3">
          切換方向
        </Button>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        此模式用於轉換遊戲時間與現實時間。遊戲時間固定比現實世界時間
        <span className="font-semibold text-yellow-400"> 慢 {offsetHours} 小時</span>。
        時間以您裝置的系統時鐘為準 (應為 GMT+8)。
      </p>
      
      <Input
        label={currentInputLabel}
        type="datetime-local"
        id="timeInput"
        value={timeInputString}
        onChange={(e) => setTimeInputString(e.target.value)}
        className={inputError ? "border-red-500" : ""}
      />
      {inputError && <p className="text-red-400 text-sm mt-[-0.5rem] mb-2">{inputError}</p>}
      
      <Button onClick={handleSubmit} isLoading={isLoading} disabled={isLoading}>
        {buttonLabel}
      </Button>

      {conversionResult && !isLoading && (
        <div className="mt-6 p-4 bg-gray-700 rounded-lg">
          <h3 className="text-lg font-semibold text-green-400 mb-2">{currentResultLabel}</h3>
          <p className="text-gray-200 text-xl font-mono">{conversionResult.formattedResultTime}</p>
          {conversionResult.timeDifferenceResult && (
            <p className="text-gray-300 mt-2 text-base">{conversionResult.timeDifferenceResult}</p>
          )}
        </div>
      )}
      {/* <GeminiMessage message={geminiMessage} isLoading={isLoading && !conversionResult} error={geminiError} title="Gemini 小提示" /> // Gemini removed */}
    </div>
  );
};

export default Mode3GameTimeConverter;
