export type TransferRole = 'r5' | 'r4' | 'adm';

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
  /** 目前提供維護權限的賽季，只由管理腳本修改 */
  maintainerEventId: string | null;
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
  updatedBy: TransferRole | null;
  /** 轉入者已建立的聯盟主檔 ID（私人賽季關聯） */
  allianceMemberId?: string;
  /** 我方成員在本季是否已有賽季紀錄；沒有時第一次操作才建立 */
  hasRecord?: boolean;
}

export interface TransferSession {
  event: TransferEvent;
  role: TransferRole;
  eventId: string;
}

export interface TransferInviteSet {
  r5: string;
  r4: string;
  adm: string;
}

export type TransferMemberChanges = Partial<
  Pick<TransferMember, 'kick' | 'backup' | 'removed' | 'transferred' | 'note'>
>;
