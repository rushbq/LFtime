/**
 * 記住最近一次成功進入的邀請碼，讓小幫手首頁與公開聯盟頁也能切回賽季頁。
 * 邀請碼本來就是這台裝置已取得的權限（匿名身分同樣留在瀏覽器），失效時會清掉。
 */
const LAST_INVITE_KEY = 'lftime-transfer-last-invite';

export const rememberInvite = (token: string) => {
  try { window.localStorage.setItem(LAST_INVITE_KEY, token); } catch { /* 隱私模式下不記住就算了 */ }
};

export const forgetInvite = (token: string) => {
  try {
    if (window.localStorage.getItem(LAST_INVITE_KEY) === token) window.localStorage.removeItem(LAST_INVITE_KEY);
  } catch { /* 同上 */ }
};

export const lastInvite = () => {
  try {
    const value = window.localStorage.getItem(LAST_INVITE_KEY);
    return value && /^[A-Za-z0-9_-]{20,128}$/.test(value) ? value : null;
  } catch {
    return null;
  }
};
