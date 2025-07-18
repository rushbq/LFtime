
import { TimeDuration } from '../types';

export const formatTwoDigits = (num: number): string => num.toString().padStart(2, '0');

export const formatDateToHHMMSS = (date: Date): string => {
  return `${formatTwoDigits(date.getHours())}:${formatTwoDigits(date.getMinutes())}:${formatTwoDigits(date.getSeconds())}`;
};

export const formatDateToYYYYMMDDHHMMSS = (date: Date): string => {
  const year = date.getFullYear();
  const month = formatTwoDigits(date.getMonth() + 1);
  const day = formatTwoDigits(date.getDate());
  return `${year}-${month}-${day} ${formatDateToHHMMSS(date)}`;
};

export const stringToDate = (dateTimeLocalStr: string): Date | null => {
  if (!dateTimeLocalStr) return null; // Handle empty string case
  const date = new Date(dateTimeLocalStr);
  return isNaN(date.getTime()) ? null : date;
};

export const calculateTimeDifference = (targetDateTime: Date): { duration: TimeDuration, targetDateTime: Date, isPast: boolean, diffMs: number } => {
  const now = new Date(); // Assumes user's system time is GMT+8
  
  let diffMs = targetDateTime.getTime() - now.getTime();
  const isPast = diffMs < 0;

  diffMs = Math.abs(diffMs); // Use absolute difference for duration calculation

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  diffMs %= (1000 * 60 * 60 * 24);
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  diffMs %= (1000 * 60 * 60);
  const minutes = Math.floor(diffMs / (1000 * 60));
  diffMs %= (1000 * 60);
  const seconds = Math.floor(diffMs / 1000);
  
  const actualDiffMsValue = (days * 86400000 + hours * 3600000 + minutes * 60000 + seconds * 1000);

  return { 
    duration: { days, hours, minutes, seconds }, 
    targetDateTime,
    isPast, 
    diffMs: (isPast ? -1 : 1) * actualDiffMsValue
  };
};


export const addDurationToCurrent = (days: number, hours: number, minutes: number, seconds: number): Date => {
  const now = new Date(); // Assumes user's system time is GMT+8
  now.setDate(now.getDate() + days);
  now.setHours(now.getHours() + hours);
  now.setMinutes(now.getMinutes() + minutes);
  now.setSeconds(now.getSeconds() + seconds);
  return now;
};

// Game time is offsetHours BEHIND real time.
// So, GameTime = RealTime - offsetHours
// And, RealTime = GameTime + offsetHours

export const convertGameTimeToRealTime = (gameDateTime: Date, offsetHours: number): Date => {
  const realTime = new Date(gameDateTime);
  realTime.setHours(realTime.getHours() + offsetHours); // Add offset to game time to get real time
  return realTime;
};

export const convertRealTimeToGameTime = (realDateTime: Date, offsetHours: number): Date => {
  const gameTime = new Date(realDateTime);
  gameTime.setHours(gameTime.getHours() - offsetHours); // Subtract offset from real time to get game time
  return gameTime;
};

export const getRealAndGameTime = (offsetHours: number): { realTime: Date, gameTime: Date } => {
  const realTime = new Date(); // Assumes user's system time is GMT+8
  const gameTime = new Date(realTime);
  gameTime.setHours(gameTime.getHours() - offsetHours); // Game time is real time minus offset
  return { realTime, gameTime };
};

export const formatDurationToString = (duration: TimeDuration, includeSeconds = false): string => {
  let parts = [];
  if (duration.days > 0) parts.push(`${duration.days} 天`);
  if (duration.hours > 0) parts.push(`${duration.hours} 小時`);
  if (duration.minutes > 0) parts.push(`${duration.minutes} 分鐘`);
  if (includeSeconds && duration.seconds > 0) parts.push(`${duration.seconds} 秒`);
  
  if (parts.length === 0) {
    if (includeSeconds) return `0 秒`;
    if (duration.seconds > 0 && duration.seconds < 60 && !includeSeconds && duration.days === 0 && duration.hours === 0 && duration.minutes === 0) {
        return `${duration.seconds} 秒`;
    }
    return "少於一分鐘";
  }
  return parts.join(' ');
};

export const parseHHMMSS = (timeStr: string): {hours: number, minutes: number, seconds: number} | null => {
  const parts = timeStr.split(':');
  if (parts.length < 2 || parts.length > 3) return null; // Allow HH:MM or HH:MM:SS
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parts.length === 3 ? parseInt(parts[2], 10) : 0;

  if (isNaN(h) || isNaN(m) || isNaN(s) || h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) {
    return null;
  }
  return {hours: h, minutes: m, seconds: s};
};
