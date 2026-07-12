
import React, { useState, useCallback } from 'react';
import DateTimeField from './shared/DateTimeField';
import Button from './shared/Button';
import { IconClock, IconFlag, IconHourglass } from './shared/FlowIcons';
import {
  calculateTimeDifference,
  formatDurationToString,
  formatDateToYYYYMMDDHHMMSS,
  formatDateToHHMMSS,
  formatDateToDatetimeLocal,
  stringToDate,
} from '../services/timeUtils';

const getDefaultTargetTime = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(17, 0, 0, 0); // Default to 5 PM tomorrow
  return formatDateToDatetimeLocal(tomorrow);
};

interface DiffResult {
  resultText: string;
  baseFormatted: string;
  targetFormatted: string;
  computedAt: string;
}

const Mode1TimeDifference: React.FC = () => {
  const [baseTimeInput, setBaseTimeInput] = useState<string>(() => formatDateToDatetimeLocal(new Date()));
  const [targetTimeInput, setTargetTimeInput] = useState<string>(getDefaultTargetTime);
  const [result, setResult] = useState<DiffResult | null>(null);
  const [calcCount, setCalcCount] = useState<number>(0);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [errField, setErrField] = useState<'base' | 'target' | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  const onBaseChange = (v: string) => { setBaseTimeInput(v); setIsDirty(true); };
  const onTargetChange = (v: string) => { setTargetTimeInput(v); setIsDirty(true); };

  const handleSubmit = useCallback(() => {
    setInputError(null);
    setErrField(null);

    const baseDateTime = stringToDate(baseTimeInput);
    if (!baseDateTime) {
      setErrField('base');
      setInputError('「基準時間」格式無效，請選擇完整的日期與時間。');
      return;
    }
    const targetDateTime = stringToDate(targetTimeInput);
    if (!targetDateTime) {
      setErrField('target');
      setInputError('「目標時間」格式無效，請選擇完整的日期與時間。');
      return;
    }

    const { duration, targetDateTime: actualTargetDate, isPast } = calculateTimeDifference(targetDateTime, baseDateTime);

    let resultText: string;
    if (isPast) {
      resultText = `目標時間比基準時間早了 ${formatDurationToString(duration, false)}`;
    } else {
      if (duration.days === 0 && duration.hours === 0 && duration.minutes === 0 && duration.seconds > 0 && duration.seconds < 60) {
        resultText = `還有 ${duration.seconds} 秒`;
      } else if (duration.days === 0 && duration.hours === 0 && duration.minutes === 0 && duration.seconds === 0) {
        resultText = '兩個時間相同';
      } else {
        resultText = `還有 ${formatDurationToString(duration, false)}`;
      }
    }
    setResult({
      resultText,
      baseFormatted: formatDateToYYYYMMDDHHMMSS(baseDateTime),
      targetFormatted: formatDateToYYYYMMDDHHMMSS(actualTargetDate),
      computedAt: formatDateToHHMMSS(new Date()),
    });
    setCalcCount((c) => c + 1);
    setIsDirty(false);
  }, [baseTimeInput, targetTimeInput]);

  return (
    <div>
      <div className="sec-head"><span className="k">01</span><h2>倒數到目標時間</h2><div className="rule" /></div>
      <p className="desc">算出從「基準時間」到「目標時間」還有多久。基準時間預設就是現在，也可以改成其他時間點；若目標時間比基準時間早，會顯示已經過了多久。</p>
      <div className="flow">
        <div className="flow-step">
          <div className="fmark" aria-hidden="true"><IconClock /></div>
          <div className="fbody">
            <DateTimeField
              label="基準時間"
              id="baseTime"
              value={baseTimeInput}
              onChange={onBaseChange}
              error={errField === 'base'}
              labelExtra={
                <button type="button" className="mini-btn" onClick={() => onBaseChange(formatDateToDatetimeLocal(new Date()))}>
                  更新為現在
                </button>
              }
            />
          </div>
        </div>
        <div className="flow-step">
          <div className="fmark" aria-hidden="true"><IconFlag /></div>
          <div className="fbody">
            <DateTimeField
              label="目標時間"
              id="targetTime"
              value={targetTimeInput}
              onChange={onTargetChange}
              error={errField === 'target'}
            />
          </div>
        </div>
        <div className="flow-step act">
          <div className="fmark" aria-hidden="true"><IconHourglass /></div>
          <div className="fbody">
            {inputError && <p className="err-msg">{inputError}</p>}
            <Button onClick={handleSubmit}>計算時間差</Button>

            {result && (
              <div className={'result' + (isDirty ? ' stale' : '')} key={calcCount}>
                <div className="rlabel"><span>計算結果</span><span className="rstamp">於 {result.computedAt} 計算</span></div>
                <div className="rval mono">{result.resultText}</div>
                <div className="rsub">基準時間：{result.baseFormatted}</div>
                <div className="rsub">目標時間：{result.targetFormatted}</div>
                {isDirty && <div className="stale-note">輸入已變更，以上仍是先前的結果，請再按一次「計算時間差」。</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Mode1TimeDifference;
