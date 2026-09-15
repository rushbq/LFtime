export type TransferRole = 'r5' | 'r4' | 'adm';

export type TransferList = 'koi' | 'bdk';

export interface TransferEvent {
  id: string;
  title: string;
  capacity: number;
  active: boolean;
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
