import React from 'react';

// 流程軌道節點用的小圖示，尺寸由 .fmark svg 樣式控制
export const IconClock: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </svg>
);

export const IconFlag: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 21V4" />
    <path d="M5 4h13l-3 4.5 3 4.5H5" fill="currentColor" strokeLinejoin="round" />
  </svg>
);

export const IconHourglass: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 3h10M7 21h10" />
    <path d="M8 3c0 6 8 6 8 9s-8 3-8 9" />
    <path d="M16 3c0 6-8 6-8 9s8 3 8 9" />
  </svg>
);
