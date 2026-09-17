import { AllianceMember, AllianceRank, TransferMember } from './types';

export const NAME_MAX = 100;
export const RANK_LABELS: Record<AllianceRank, string> = { r5: 'R5', r4: 'R4', member: '' };
const RANK_ORDER: Record<AllianceRank, number> = { r5: 0, r4: 1, member: 2 };

/** R5 → R4 → 一般成員；組內戰力遞減，未填戰力墊底；再依名稱、ID 固定順序 */
export const compareAllianceMembers = (left: AllianceMember, right: AllianceMember) =>
  RANK_ORDER[left.rank] - RANK_ORDER[right.rank]
  || (right.power ?? -1) - (left.power ?? -1)
  || left.name.localeCompare(right.name)
  || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

export const sortAllianceMembers = (members: AllianceMember[]) => [...members].sort(compareAllianceMembers);

export type MemberInputError = 'name-required' | 'name-too-long' | 'power-invalid';

export interface MemberInput {
  name: string;
  power: number | null;
  rank: AllianceRank;
}

export const normalizeMemberInput = (
  draft: { name: string; power: string; rank: AllianceRank },
): { ok: true; value: MemberInput } | { ok: false; error: MemberInputError } => {
  const name = draft.name.trim();
  if (!name) return { ok: false, error: 'name-required' };
  if (name.length > NAME_MAX) return { ok: false, error: 'name-too-long' };

  const rawPower = draft.power.replace(/[,\s]/g, '');
  let power: number | null = null;
  if (rawPower) {
    if (!/^\d+$/.test(rawPower)) return { ok: false, error: 'power-invalid' };
    power = Number(rawPower);
    if (!Number.isSafeInteger(power)) return { ok: false, error: 'power-invalid' };
  }
  return { ok: true, value: { name, power, rank: draft.rank } };
};

export const hasDuplicateName = (members: AllianceMember[], name: string, excludeId?: string) => {
  const target = name.trim().toLocaleLowerCase();
  return members.some((member) => member.id !== excludeId && member.name.toLocaleLowerCase() === target);
};

/** 轉入者建立聯盟主檔時使用的固定 ID，重複新增會撞到同一份文件 */
export const linkedMemberId = (eventId: string, recordId: string) => `${eventId}--${recordId}`;

/**
 * 把聯盟主檔與賽季紀錄合併成賽季頁要顯示、要計算的名單。
 * 人數與名額一律從這份結果算，避免各處各算一次而重複計數。
 */
export const mergeSeason = (alliance: AllianceMember[], records: TransferMember[]) => {
  const allianceIds = new Set(alliance.map((member) => member.id));
  const koiRecords = new Map(
    records.filter((record) => record.list === 'koi').map((record) => [record.id, record]),
  );
  const bdkRecords = records.filter((record) => record.list === 'bdk');
  // 已從轉入名單建立主檔的人，本季只算在轉入區
  const linkedIds = new Set(bdkRecords.flatMap((record) => record.allianceMemberId ? [record.allianceMemberId] : []));

  const koi: TransferMember[] = sortAllianceMembers(alliance)
    .filter((member) => !linkedIds.has(member.id))
    .map((member, index) => {
      const record = koiRecords.get(member.id);
      return {
        id: member.id,
        list: 'koi',
        number: index + 1,
        name: member.name,
        power: member.power ?? undefined,
        rank: RANK_LABELS[member.rank] || undefined,
        kick: record?.kick ?? false,
        backup: record?.backup ?? false,
        removed: record?.removed ?? false,
        transferred: false,
        note: record?.note ?? '',
        updatedAt: record?.updatedAt ?? null,
        updatedBy: record?.updatedBy ?? null,
        hasRecord: Boolean(record),
      };
    });

  const bdk = bdkRecords
    // 主檔被刪除的轉入者移出有效清單，但賽季紀錄本身保留
    .filter((record) => !record.allianceMemberId || allianceIds.has(record.allianceMemberId))
    .sort((left, right) => left.number - right.number);

  return { koi, bdk };
};

/** 本季已加入、尚未建立聯盟主檔的轉入者 */
export const joinableTransfers = (alliance: AllianceMember[], records: TransferMember[], eventId: string) => {
  const allianceIds = new Set(alliance.map((member) => member.id));
  return records
    .filter((record) => record.list === 'bdk' && record.transferred && !record.allianceMemberId)
    .filter((record) => !allianceIds.has(linkedMemberId(eventId, record.id)))
    .sort((left, right) => left.number - right.number);
};
