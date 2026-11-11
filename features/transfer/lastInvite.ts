/**
 * 記住這台裝置的編輯邀請碼。邀請碼綁聯盟、不綁賽季，持有就能編輯所有賽季；
 * 失效時會清掉，回到查看模式。
 */
const LAST_INVITE_KEY = 'lftime-transfer-last-invite';
const INVITE_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

export const INVALID_INVITE_CODES = ['invite-not-found', 'invite-disabled', 'invite-no-role', 'invite-no-alliance', 'permission-denied'];

export const isInviteToken = (value: string) => INVITE_PATTERN.test(value);

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
    return value && isInviteToken(value) ? value : null;
  } catch {
    return null;
  }
};
