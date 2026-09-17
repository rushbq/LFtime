import { MemberInputError } from './allianceModel';
import { Lang } from './i18n';

/** 聯盟名單頁文案；共用的主題、語言、錯誤訊息沿用 i18n.ts 的 STRINGS */

const zh = {
  title: (alliance: string) => `${alliance} 聯盟名單`,
  summary: (total: number, r5: number, r4: number) => `共 ${total} 人 · R5 ${r5} · R4 ${r4}`,
  loading: '載入聯盟名單中…',
  checking: '正在驗證邀請連結',
  empty: '沒有符合條件的成員',
  copyPublic: '複製公開網址',
  copied: '已複製',
  manageHint: '你可以新增、修改、刪除成員。刪除會同步移出進行中的賽季名單，既有轉移紀錄會保留。',
  readOnlyHint: '這組邀請連結目前沒有聯盟名單的維護權限（需 Adm／R5，且賽季仍在進行），只能查看。',

  searchPlaceholder: '搜尋名稱',
  rankFilter: '階級篩選',
  rankAll: '全部階級',
  rankMember: '一般成員',

  add: '新增成員',
  edit: '編輯',
  delete: '刪除',
  save: '儲存',
  saving: '儲存中…',
  cancel: '取消',
  editTitle: (name: string) => `編輯 ${name}`,
  addTitle: '新增成員',
  fieldName: '名稱',
  fieldPower: '戰力',
  fieldRank: '階級',
  powerPlaceholder: '可留空',
  fromTransfer: '從本季已加入的轉入名單新增',
  fromTransferManual: '不使用，手動輸入',
  fromTransferHint: '選取後這位玩家在本季仍算轉入者，不會重複出現在我方名單。',
  duplicateName: '已有同名成員。名稱不是身分識別，確認不是同一人再儲存。',
  inputError: (code: MemberInputError) => ({
    'name-required': '請輸入名稱',
    'name-too-long': '名稱最多 100 字',
    'power-invalid': '戰力必須是不含小數的非負整數',
  })[code],
  latest: (name: string, power: string, rank: string) => `雲端最新：${name} · ${power} · ${rank}`,
  deletedWhileEditing: '這位成員已被其他幹部刪除，你輸入的內容仍保留在畫面上，但無法儲存。',
  editActions: (name: string) => `${name} 的操作`,

  deleteConfirm: (name: string) => `確定刪除「${name}」？`,
  deleteNote: '會同步移出進行中的賽季名單與人數計算，既有轉移紀錄保留。',
  confirmDelete: '確定刪除',
};

export type AllianceDict = typeof zh;

const en: AllianceDict = {
  title: (alliance) => `${alliance} Alliance Roster`,
  summary: (total, r5, r4) => `${total} members · R5 ${r5} · R4 ${r4}`,
  loading: 'Loading roster…',
  checking: 'Checking your invite link',
  empty: 'No members match',
  copyPublic: 'Copy public link',
  copied: 'Copied',
  manageHint: 'You can add, edit and delete members. Deleting also removes them from the running season list; past transfer records are kept.',
  readOnlyHint: 'This invite link cannot maintain the roster (needs Adm/R5 on an active season). View only.',

  searchPlaceholder: 'Search name',
  rankFilter: 'Filter by rank',
  rankAll: 'All ranks',
  rankMember: 'Member',

  add: 'Add member',
  edit: 'Edit',
  delete: 'Delete',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  editTitle: (name) => `Edit ${name}`,
  addTitle: 'Add member',
  fieldName: 'Name',
  fieldPower: 'Power',
  fieldRank: 'Rank',
  powerPlaceholder: 'Optional',
  fromTransfer: 'Add from players who joined this season',
  fromTransferManual: 'None — type manually',
  fromTransferHint: 'They still count as joining this season and will not appear twice in our list.',
  duplicateName: 'A member with this name already exists. Names are not IDs — make sure this is a different player.',
  inputError: (code) => ({
    'name-required': 'Enter a name',
    'name-too-long': 'Name can be at most 100 characters',
    'power-invalid': 'Power must be a whole number, 0 or more',
  })[code],
  latest: (name, power, rank) => `Latest in cloud: ${name} · ${power} · ${rank}`,
  deletedWhileEditing: 'Another officer deleted this member. Your input is kept on screen but cannot be saved.',
  editActions: (name) => `Actions for ${name}`,

  deleteConfirm: (name) => `Delete "${name}"?`,
  deleteNote: 'They will also be removed from the running season list and counts. Past transfer records are kept.',
  confirmDelete: 'Delete',
};

export const ALLIANCE_STRINGS: Record<Lang, AllianceDict> = { zh, en };
