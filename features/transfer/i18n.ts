/**
 * 轉移名單的文案字典。
 *
 * 只有這一頁需要雙語（英文幹部會一起看、也會一起操作），
 * 所以不引入 i18n 套件：55 條字串用一個有型別的物件就夠，
 * 而且 `const en: Dict` 會讓「漏翻一條」直接變成編譯錯誤。
 *
 * 英文一律挑短詞：手機上一列要塞三顆按鈕，每格只有約 80px。
 * Kick / Backup 沿用公會原本 Excel 欄位的講法，比 Remove / Standby 更短也更熟。
 */

export type Lang = 'zh' | 'en';

export const LOCALE: Record<Lang, string> = { zh: 'zh-TW', en: 'en-US' };
export const HTML_LANG: Record<Lang, string> = { zh: 'zh-Hant-TW', en: 'en' };

export type TransferErrorCode =
  | 'not-connected'
  | 'config-missing'
  | 'invite-no-role'
  | 'invite-not-found'
  | 'invite-disabled'
  | 'invite-expired'
  | 'invite-no-event'
  | 'event-not-found'
  | 'event-closed'
  | 'member-not-found'
  | 'note-conflict'
  | 'invites-not-found'
  | 'invites-incomplete'
  | 'permission-denied'
  | 'unavailable'
  | 'unknown';

const zh = {
  back: '七號小幫手',
  themeToLight: '切換成淺色主題',
  themeToDark: '切換成深色主題',
  langSwitch: 'Switch to English',
  yourRole: '你的身分',
  synced: '已同步',
  saving: (n: number) => `儲存中 ${n}`,

  premiseUs: (capacity: number, current: number) =>
    `是我們，共 ${capacity} 個位子、現有 ${current} 人`,
  premiseThem: (n: number) => `有 ${n} 人要搬進來`,

  nextStep: '現在要做的事',
  headlinePick: (n: number) => `還要再選 ${n} 人請離開`,
  headlinePicked: '踢除名單已備齊',
  headlineLeave: (n: number) => `名單已選滿，還有 ${n} 人尚未離開`,
  headlineJoin: (free: number, waiting: number) =>
    `空出 ${free} 個位子，BDK 還有 ${waiting} 人沒進來`,
  headlineDone: '轉移完成，所有人都就定位了',
  hintPick: (backup: number) =>
    `到 KOi 名單勾「踢除」，不確定的先放「候補」。目前候補 ${backup} 人。`,
  hintLeave: '請已勾踢除的人退盟，退掉後回來勾「已離開」。',
  hintJoin: '通知 BDK 的人進來，進來後到 BDK 名單勾「已加入」。',
  hintDone: (koi: number, bdk: number, total: number, capacity: number) =>
    `KOi ${koi} 人 + BDK ${bdk} 人，共 ${total} / ${capacity}。`,

  stagePick: '選人',
  stageOut: 'KOi 離開',
  stageIn: 'BDK 加入',

  seatStay: (n: number) => `KOi 留下 ${n}`,
  seatJoined: (n: number) => `＋ BDK 已進 ${n}`,
  seatNow: '目前',
  seatFree: (n: number) => `空 ${n} 位`,
  seatOver: (n: number) => `超出 ${n} 位`,

  inviteTitle: '管理邀請連結',
  inviteNote: '每種身分共用一條連結。連結本身就是存取權限，請只傳給對應幹部。',
  copy: '複製',
  copied: '已複製',

  tabUs: '我方 · 誰要走',
  tabThem: '對方 · 誰要來',
  briefKoi: (n: number) => ({
    lead: '這是 ',
    strong: `我們自己的 ${n} 人`,
    tail: '。勾「踢除」決定誰離開，不確定的放「候補」；對方退盟後再勾「已離開」。',
  }),
  briefBdk: (n: number) => ({
    lead: '這是 ',
    strong: `BDK 要搬進來的 ${n} 人`,
    tail: '。他們進盟後勾「已加入」，這裡不做踢除判斷。',
  }),

  searchPlaceholder: '搜尋玩家名稱',
  searchLabel: '搜尋玩家名稱',
  filterLabel: '篩選名單',
  show: '顯示',
  filterAll: '全部',
  filterKick: '已勾踢除',
  filterBackup: '候補',
  filterPendingKoi: '還沒離開',
  filterPendingBdk: '還沒加入',
  filterDoneKoi: '已離開',
  filterDoneBdk: '已加入',
  filterNoted: '有備註',

  kick: '踢除',
  backup: '候補',
  left: '已離開',
  joined: '已加入',
  decisionGroup: (name: string) => `${name} 的去留判斷`,
  toggleLabel: (name: string, action: string) => `${name}：${action}`,
  addNote: (name: string) => `新增 ${name} 的備註`,
  editNote: (name: string) => `編輯 ${name} 的備註`,
  noteFieldLabel: (name: string) => `${name} 的備註`,
  notePlaceholder: '輸入備註，點其他地方即儲存',
  noteFailed: '沒有存起來，你打的字還在。點一下外面可以再試一次。',
  updatedBy: (who: string, when: string) => `更新：${who} · ${when}`,

  emptyList: '沒有符合條件的玩家',
  listLoading: '載入名單中…',
  listStuckTitle: '名單一直沒有回應',
  listStuckBody: '邀請連結是有效的，但名單資料沒有傳回來。可能是網路不穩，或雲端權限設定有異動。',
  reconnect: '重新連線',

  checkingTitle: '正在驗證邀請連結',
  checkingBody: '連線至轉移名單…',
  blockedTitle: '無法開啟轉移名單',
  backToApp: '返回七號小幫手',

  legendKick: '踢除',
  legendKickBody: '：確定請他離開',
  legendBackup: '候補',
  legendBackupBody: '：不夠再踢他',
  legendSync: '勾選與備註會自動同步給其他幹部',

  error: (code: TransferErrorCode, detail?: string): string => ({
    'not-connected': '尚未連線到雲端，請重新整理頁面',
    'config-missing': `雲端尚未設定完成：${detail ?? ''}`,
    'invite-no-role': '這組邀請連結沒有有效身分',
    'invite-not-found': '找不到這組邀請連結',
    'invite-disabled': '這組邀請連結已停用',
    'invite-expired': '這組邀請連結已過期',
    'invite-no-event': '邀請連結缺少活動資料',
    'event-not-found': '找不到這次轉移活動',
    'event-closed': '這次轉移活動已關閉',
    'member-not-found': '找不到這位玩家',
    'note-conflict': '這則備註剛被其他幹部改過，請重新整理看最新內容',
    'invites-not-found': '找不到邀請連結設定',
    'invites-incomplete': '邀請連結設定不完整',
    'permission-denied': '這組邀請連結已失效或沒有操作權限',
    unavailable: '目前無法連線到雲端，請檢查網路後重試',
    unknown: detail || '發生未知的錯誤',
  })[code],
};

export type Dict = typeof zh;

const en: Dict = {
  back: 'Back',
  themeToLight: 'Switch to light theme',
  themeToDark: 'Switch to dark theme',
  langSwitch: '切換成中文',
  yourRole: 'Your role',
  synced: 'Synced',
  saving: (n) => `Saving ${n}`,

  premiseUs: (capacity, current) => `is us — ${capacity} seats, ${current} now`,
  premiseThem: (n) => `has ${n} waiting to join`,

  nextStep: 'Next step',
  headlinePick: (n) => `Pick ${n} more to remove`,
  headlinePicked: 'Removal list is ready',
  headlineLeave: (n) => `List is full — ${n} still to leave`,
  headlineJoin: (free, waiting) =>
    `${free} ${free === 1 ? 'seat' : 'seats'} free — ${waiting} from BDK still to join`,
  headlineDone: 'Transfer complete — everyone is in place',
  hintPick: (backup) =>
    `In the KOi list tick "Kick", or "Backup" if unsure. ${backup} on backup so far.`,
  hintLeave: 'Ask everyone marked Kick to leave, then tick "Left" here.',
  hintJoin: 'Tell the BDK players to join, then tick "Joined" in the BDK list.',
  hintDone: (koi, bdk, total, capacity) =>
    `KOi ${koi} + BDK ${bdk} = ${total} / ${capacity}.`,

  stagePick: 'Pick',
  stageOut: 'KOi out',
  stageIn: 'BDK in',

  seatStay: (n) => `KOi stays ${n}`,
  seatJoined: (n) => `+ BDK in ${n}`,
  seatNow: 'Now',
  seatFree: (n) => `${n} free`,
  seatOver: (n) => `${n} over`,

  inviteTitle: 'Manage invite links',
  inviteNote: 'One link per role. The link itself is the access — only send it to that officer.',
  copy: 'Copy',
  copied: 'Copied',

  tabUs: 'Us · leaving',
  tabThem: 'Them · joining',
  briefKoi: (n) => ({
    lead: 'This is ',
    strong: `our own ${n} players`,
    tail: '. Tick "Kick" to remove, "Backup" if unsure; tick "Left" once they have actually left.',
  }),
  briefBdk: (n) => ({
    lead: 'This is ',
    strong: `the ${n} players joining from BDK`,
    tail: '. Tick "Joined" once they are in. No removal decisions here.',
  }),

  searchPlaceholder: 'Search player',
  searchLabel: 'Search player name',
  filterLabel: 'Filter list',
  show: 'Show',
  filterAll: 'All',
  filterKick: 'Kicked',
  filterBackup: 'Backup',
  filterPendingKoi: 'Not left',
  filterPendingBdk: 'Not joined',
  filterDoneKoi: 'Left',
  filterDoneBdk: 'Joined',
  filterNoted: 'With note',

  kick: 'Kick',
  backup: 'Backup',
  left: 'Left',
  joined: 'Joined',
  decisionGroup: (name) => `Decision for ${name}`,
  toggleLabel: (name, action) => `${name}: ${action}`,
  addNote: (name) => `Add a note for ${name}`,
  editNote: (name) => `Edit the note for ${name}`,
  noteFieldLabel: (name) => `Note for ${name}`,
  notePlaceholder: 'Type a note — tap outside to save',
  noteFailed: 'Not saved. Your text is still here — tap outside to try again.',
  updatedBy: (who, when) => `${who} · ${when}`,

  emptyList: 'No players match',
  listLoading: 'Loading list…',
  listStuckTitle: 'The list is not responding',
  listStuckBody: 'The invite link is valid, but no list data came back. The network may be unstable, or the cloud permissions may have changed.',
  reconnect: 'Reconnect',

  checkingTitle: 'Checking your invite link',
  checkingBody: 'Connecting to the transfer list…',
  blockedTitle: 'Cannot open the transfer list',
  backToApp: 'Back to the toolbox',

  legendKick: 'Kick',
  legendKickBody: ': confirmed to leave',
  legendBackup: 'Backup',
  legendBackupBody: ': only if we need more',
  legendSync: 'Ticks and notes sync to every officer',

  error: (code, detail) => ({
    'not-connected': 'Not connected to the cloud. Please refresh the page.',
    'config-missing': `Cloud is not configured: ${detail ?? ''}`,
    'invite-no-role': 'This invite link has no valid role',
    'invite-not-found': 'Invite link not found',
    'invite-disabled': 'This invite link has been disabled',
    'invite-expired': 'This invite link has expired',
    'invite-no-event': 'This invite link is missing its event data',
    'event-not-found': 'Transfer event not found',
    'event-closed': 'This transfer event is closed',
    'member-not-found': 'Player not found',
    'note-conflict': 'Another officer just changed this note. Refresh to see the latest.',
    'invites-not-found': 'Invite link settings not found',
    'invites-incomplete': 'Invite link settings are incomplete',
    'permission-denied': 'This invite link is no longer valid, or you lack permission',
    unavailable: 'Cannot reach the cloud right now. Check your connection and retry.',
    unknown: detail || 'Something went wrong',
  })[code],
};

export const STRINGS: Record<Lang, Dict> = { zh, en };

export const detectLang = (): Lang =>
  typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
