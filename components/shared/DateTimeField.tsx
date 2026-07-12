import React from 'react';

interface DateTimeFieldProps {
  label: string;
  id: string;
  /** YYYY-MM-DDTHH:MM；任一半邊未填時仍保留另一半（如 "2026-07-13T" 或 "T14:00"） */
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  labelExtra?: React.ReactNode;
}

// macOS Safari 的 datetime-local 只會顯示日期、無法輸入時間，
// 因此拆成 date + time 兩個原生欄位，桌機與手機的 Safari/Chrome 都支援。
const DateTimeField: React.FC<DateTimeFieldProps> = ({ label, id, value, onChange, error = false, labelExtra }) => {
  const tIdx = value.indexOf('T');
  const datePart = tIdx >= 0 ? value.slice(0, tIdx) : value;
  const timePart = tIdx >= 0 ? value.slice(tIdx + 1) : '';
  const errClass = error ? 'err' : '';

  return (
    <div className="field">
      <div className="label-row">
        <label htmlFor={`${id}-date`}>{label}</label>
        {labelExtra}
      </div>
      <div className="dt-row">
        <input
          type="date"
          id={`${id}-date`}
          className={errClass}
          value={datePart}
          onChange={(e) => onChange(`${e.target.value}T${timePart}`)}
        />
        <input
          type="time"
          id={`${id}-time`}
          className={errClass}
          value={timePart}
          onChange={(e) => onChange(`${datePart}T${e.target.value}`)}
        />
      </div>
    </div>
  );
};

export default DateTimeField;
