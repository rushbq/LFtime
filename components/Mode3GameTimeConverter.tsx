
import React, { useState, useCallback } from 'react';
import DateTimeField from './shared/DateTimeField';
import Button from './shared/Button';
import {
  convertGameTimeToRealTime,
  convertRealTimeToGameTime,
  formatDateToYYYYMMDDHHMMSS,
  formatDateToHHMMSS,
  formatDateToDatetimeLocal,
  stringToDate,
  calculateTimeDifference,
  formatDurationToString
} from '../services/timeUtils';
import { ConversionDirection } from '../types';

interface Mode3Props {
  offsetHours: number;
}

const getDefaultInputTime = () => {
  const today = new Date();
  today.setHours(10, 0, 0, 0); // Default to 10 AM today
  return formatDateToDatetimeLocal(today);
};

interface ConversionResult {
  formattedResultTime: string;
  timeDifferenceResult?: string;
  computedAt: string;
}

const Mode3GameTimeConverter: React.FC<Mode3Props> = ({ offsetHours }) => {
  const [timeInputString, setTimeInputString] = useState<string>(getDefaultInputTime());
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [calcCount, setCalcCount] = useState<number>(0);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [direction, setDirection] = useState<ConversionDirection>(ConversionDirection.GameToReal);

  const onInputChange = (v: string) => { setTimeInputString(v); setIsDirty(true); };

  const toggleDirection = () => {
    setDirection(prev => prev === ConversionDirection.GameToReal ? ConversionDirection.RealToGame : ConversionDirection.GameToReal);
    setTimeInputString(getDefaultInputTime()); // Reset input example on toggle
    setConversionResult(null);
    setIsDirty(false);
    setInputError(null);
  };

  const handleSubmit = useCallback(() => {
    setInputError(null);

    const inputDateTime = stringToDate(timeInputString);
    if (!inputDateTime) {
      setInputError('日期時間格式無效。請選擇一個有效的日期和時間。');
      return;
    }

    let resultDate: Date;
    let timeDifferenceResult: string | undefined = undefined;

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
    } else { // RealToGame
      resultDate = convertRealTimeToGameTime(inputDateTime, offsetHours);
    }

    const formattedResultTime = formatDateToYYYYMMDDHHMMSS(resultDate);
    setConversionResult({ formattedResultTime, timeDifferenceResult, computedAt: formatDateToHHMMSS(new Date()) });
    setCalcCount((c) => c + 1);
    setIsDirty(false);
  }, [timeInputString, offsetHours, direction]);

  const currentInputLabel = direction === ConversionDirection.GameToReal ? "遊戲日期與時間" : "台灣日期與時間";
  const currentResultLabel = direction === ConversionDirection.GameToReal ? "對應的台灣時間" : "對應的遊戲時間";
  const buttonLabel = direction === ConversionDirection.GameToReal ? "換成台灣時間" : "換成遊戲時間";
  const titleLabel = direction === ConversionDirection.GameToReal ? "遊戲時間 → 台灣時間" : "台灣時間 → 遊戲時間";

  return (
    <div>
      <div className="head-row">
        <div className="sec-head"><span className="k">03</span><h2>{titleLabel}</h2></div>
        <Button onClick={toggleDirection} variant="secondary" className="sm">切換方向</Button>
      </div>
      <p className="desc">
        遊戲時間與台灣時間互換（遊戲比台灣<em>慢 {offsetHours} 小時</em>）。用右上角按鈕切換換算方向。
      </p>

      <DateTimeField
        label={currentInputLabel}
        id="timeInput"
        value={timeInputString}
        onChange={onInputChange}
        error={!!inputError}
      />
      {inputError && <p className="err-msg">{inputError}</p>}

      <Button onClick={handleSubmit}>{buttonLabel}</Button>

      {conversionResult && (
        <div className={'result' + (isDirty ? ' stale' : '')} key={calcCount}>
          <div className="rlabel"><span>{currentResultLabel}</span><span className="rstamp">於 {conversionResult.computedAt} 計算</span></div>
          <div className="rval mono">{conversionResult.formattedResultTime}</div>
          {conversionResult.timeDifferenceResult && (
            <div className="rsub">{conversionResult.timeDifferenceResult}</div>
          )}
          {isDirty && <div className="stale-note">輸入已變更，以上仍是先前的結果，請再按一次「{buttonLabel}」。</div>}
        </div>
      )}
    </div>
  );
};

export default Mode3GameTimeConverter;
