/**
 * 記住最近一次成功進入的邀請碼，讓小幫手首頁與公開聯盟頁也能切回賽季頁。
 * 邀請碼本來就是這台裝置已取得的權限（匿名身分同樣留在瀏覽器），失效時會清掉。
 * 同時記住賽季結束時間，讓首頁不必連 Firebase 就能判斷要不要顯示賽季入口。
 */
const LAST_INVITE_KEY = 'lftime-transfer-last-invite';
const CLOSES_AT_KEY = 'lftime-transfer-last-invite-closes-at';

export const INVALID_INVITE_CODES = ['invite-not-found', 'invite-disabled', 'invite-expired', 'invite-no-role', 'invite-no-event', 'permission-denied'];

export const rememberInvite = (token: string, event: { active: boolean; closesAt?: number }) => {
  try {
    window.localStorage.setItem(LAST_INVITE_KEY, token);
    // 已關閉的活動記成 0，視同已結束
    const closesAt = event.active ? event.closesAt : 0;
    if (closesAt == null) window.localStorage.removeItem(CLOSES_AT_KEY);
    else window.localStorage.setItem(CLOSES_AT_KEY, String(closesAt));
  } catch { /* 隱私模式下不記住就算了 */ }
};

export const forgetInvite = (token: string) => {
  try {
    if (window.localStorage.getItem(LAST_INVITE_KEY) === token) {
      window.localStorage.removeItem(LAST_INVITE_KEY);
      window.localStorage.removeItem(CLOSES_AT_KEY);
    }
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

/** 記住的賽季仍在進行中才回傳邀請碼；結束後入口隱藏，但邀請連結本身仍可唯讀查看 */
export const openSeasonInvite = () => {
  const token = lastInvite();
  if (!token) return null;
  try {
    const raw = window.localStorage.getItem(CLOSES_AT_KEY);
    return raw === null || Date.now() < Number(raw) ? token : null;
  } catch {
    return token;
  }
};
