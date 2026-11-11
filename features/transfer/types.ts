/** 編輯身分：兩者權限相同，只用來標示是誰改的 */
export type TransferRole = 'xiaoxing' | 'snoopy';

export const ROLES: TransferRole[] = ['xiaoxing', 'snoopy'];
export const ROLE_LABELS: Record<TransferRole, string> = { xiaoxing: '呆萌小星', snoopy: '聰明的史努比' };

/** 舊資料的 updatedBy 可能是 r5／r4／adm，照原樣大寫顯示 */
export const roleLabel = (value: string) =>
  value in ROLE_LABELS ? ROLE_LABELS[value as TransferRole] : value.toUpperCase();

/**
 * 賽季名單分區。資料值沿用舊格式：'koi' = 我方、'bdk' = 外部轉入聯盟，
 * 外部聯盟的實際名稱改由 TransferEvent.externalName 決定。
 */
export type TransferList = 'koi' | 'bdk';

export type AllianceRank = 'r5' | 'r4' | 'member';

/** 聯盟主檔成員（公開資料），ID 固定，跨賽季沿用 */
export interface AllianceMember {
  id: string;
  name: string;
  power: number | null;
  rank: AllianceRank;
  version: number;
}

export interface Alliance {
  id: string;
  name: string;
}

export interface TransferEvent {
  id: string;
  title: string;
  /** 選填：活動文件加上 titleEn 欄位就會在英文介面顯示，沒有就沿用 title */
  titleEn?: string;
  capacity: number;
  active: boolean;
  /** 選填：結束時間（毫秒）。超過後賽季變唯讀，仍可查看 */
  closesAt?: number;
  /** 我方聯盟主檔 ID，舊資料沒有時視為 'koi' */
  allianceId: string;
  /** 外部轉入聯盟的顯示名稱，舊資料沒有時視為 'BDK' */
  externalName: string;
}

/** 賽季列表項目 */
export interface SeasonSummary extends TransferEvent {
  createdAt: number | null;
}

/** 賽季管理頁可調整的賽季設定 */
export interface SeasonSettings {
  title: string;
  titleEn?: string;
  externalName: string;
  /** 毫秒；null＝不設結束時間 */
  closesAt: number | null;
}

export interface TransferMember {
  id: string;
  list: TransferList;
  number: number;
  name: string;
  power?: number;
  rank?: string;
  kick: boolean;
  backup: boolean;
  removed: boolean;
  transferred: boolean;
  note: string;
  updatedAt: number | null;
  /** 身分代碼；舊資料可能是 r5／r4／adm，顯示用 roleLabel */
  updatedBy: string | null;
  /** 轉入者已建立的聯盟主檔 ID（私人賽季關聯） */
  allianceMemberId?: string;
  /** 我方成員在本季是否已有賽季紀錄；沒有時第一次操作才建立 */
  hasRecord?: boolean;
}

/** 持有效邀請碼的編輯身分，適用該聯盟所有賽季 */
export interface EditorSession {
  allianceId: string;
  role: TransferRole;
  token: string;
}

export type TransferInviteSet = Record<TransferRole, string>;

export type TransferMemberChanges = Partial<
  Pick<TransferMember, 'kick' | 'backup' | 'removed' | 'transferred' | 'note'>
>;
