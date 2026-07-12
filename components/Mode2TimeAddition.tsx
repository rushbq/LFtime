
import React, { useState, useCallback } from 'react';
import Input from './shared/Input';
import DateTimeField from './shared/DateTimeField';
import Button from './shared/Button';
import { IconClock } from './shared/FlowIcons';
import {
  addDurationToCurrent,
  formatDateToYYYYMMDDHHMMSS,
  formatDateToHHMMSS,
  formatDateToDatetimeLocal,
  formatDurationToString,
  stringToDate,
} from '../services/timeUtils';

interface AdditionResult {
  futureFormatted: string;
  baseFormatted: string;
  durationFormatted: string;
  computedAt: string;
}

const Mode2TimeAddition: React.FC = () => {
  const [baseTimeInput, setBaseTimeInput] = useState<string>(() => formatDateToDatetimeLocal(new Date()));
  const [days, setDays] = useState<string>('0');
  const [hours, setHours] = useState<string>('0');
  const [minutes, setMinutes] = useState<string>('0');
  const [seconds, setSeconds] = useState<string>('0');

  const [result, setResult] = useState<AdditionResult | null>(null);
  const [calcCount, setCalcCount] = useState<number>(0);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [baseError, setBaseError] = useState<boolean>(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const onBaseChange = (v: string) => { setBaseTimeInput(v); setIsDirty(true); };
  const onDurationChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    setIsDirty(true);
  };

  const handleSubmit = useCallback(() => {
    setInputError(null);
    setBaseError(false);

    const baseDateTime = stringToDate(baseTimeInput);
    if (!baseDateTime) {
      setBaseError(true);
      setInputError('「基準時間」格式無效，請選擇完整的日期與時間。');
      return;
    }

    const d = parseInt(days, 10);
    const h = parseInt(hours, 10);
    const m = parseInt(minutes, 10);
    const s = parseInt(seconds, 10);

    if (isNaN(d) || isNaN(h) || isNaN(m) || isNaN(s) || d < 0 || h < 0 || m < 0 || s < 0) {
      setInputError('天／小時／分鐘／秒都必須是 0 或正整數。');
      return;
    }
    if (d === 0 && h === 0 && m === 0 && s === 0) {
      setInputError('請至少在其中一格填入大於 0 的數字。');
      return;
    }

    const futureTime = addDurationToCurrent(d, h, m, s, baseDateTime);
    setResult({
      futureFormatted: formatDateToYYYYMMDDHHMMSS(futureTime),
      baseFormatted: formatDateToYYYYMMDDHHMMSS(baseDateTime),
      durationFormatted: formatDurationToString({ days: d, hours: h, minutes: m, seconds: s }, true),
      computedAt: formatDateToHHMMSS(new Date()),
    });
    setCalcCount((c) => c + 1);
    setIsDirty(false);
  }, [baseTimeInput, days, hours, minutes, seconds]);

  return (
    <div>
      <div className="sec-head"><span className="k">02</span><h2>從基準時間往後推算</h2><div className="rule" /></div>
      <p className="desc">在「基準時間」上加天／時／分／秒，算出加完後是幾月幾號幾點。基準時間預設就是現在，也可以改成其他起算點。</p>

      <div className="flow">
        <div className="flow-step">
          <div className="fmark" aria-hidden="true"><IconClock /></div>
          <div className="fbody">
            <DateTimeField
              label="基準時間"
              id="additionBaseTime"
              value={baseTimeInput}
              onChange={onBaseChange}
              error={baseError}
              labelExtra={
                <button type="button" className="mini-btn" onClick={() => onBaseChange(formatDateToDatetimeLocal(new Date()))}>
                  更新為現在
                </button>
              }
            />
          </div>
        </div>
        <div className="flow-step">
          <div className="fmark txt" aria-hidden="true">＋</div>
          <div className="fbody">
            <div className="label-row"><span className="glabel">要加上的時間</span></div>
            <div className="num-grid">
              <Input label="天" type="number" inputMode="numeric" pattern="[0-9]*" id="days" value={days} onChange={onDurationChange(setDays)} min="0" />
              <Input label="小時" type="number" inputMode="numeric" pattern="[0-9]*" id="hours" value={hours} onChange={onDurationChange(setHours)} min="0" />
              <Input label="分鐘" type="number" inputMode="numeric" pattern="[0-9]*" id="minutes" value={minutes} onChange={onDurationChange(setMinutes)} min="0" />
              <Input label="秒" type="number" inputMode="numeric" pattern="[0-9]*" id="seconds" value={seconds} onChange={onDurationChange(setSeconds)} min="0" />
            </div>
          </div>
        </div>
        <div className="flow-step act">
          <div className="fmark txt" aria-hidden="true">＝</div>
          <div className="fbody">
            {inputError && <p className="err-msg">{inputError}</p>}
            <Button onClick={handleSubmit}>計算疊加結果</Button>

            {result && (
              <div className={'result' + (isDirty ? ' stale' : '')} key={calcCount}>
                <div className="rlabel"><span>疊加結果</span><span className="rstamp">於 {result.computedAt} 計算</span></div>
                <div className="rval mono">{result.futureFormatted}</div>
                <div className="rsub">基準時間：{result.baseFormatted}</div>
                <div className="rsub">加上：{result.durationFormatted}</div>
                {isDirty && <div className="stale-note">輸入已變更，以上仍是先前的結果，請再按一次「計算疊加結果」。</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Mode2TimeAddition;
