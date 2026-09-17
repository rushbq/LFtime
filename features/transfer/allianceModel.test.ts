import { describe, expect, it } from 'vitest';
import {
  hasDuplicateName,
  joinableTransfers,
  linkedMemberId,
  mergeSeason,
  normalizeMemberInput,
  sortAllianceMembers,
} from './allianceModel';
import { AllianceMember, TransferMember } from './types';

const member = (id: string, rank: AllianceMember['rank'], power: number | null, name = id): AllianceMember =>
  ({ id, name, power, rank, version: 1 });

const record = (id: string, list: 'koi' | 'bdk', extra: Partial<TransferMember> = {}): TransferMember => ({
  id, list, number: 1, name: id, kick: false, backup: false, removed: false, transferred: false,
  note: '', updatedAt: null, updatedBy: null, ...extra,
});

describe('sortAllianceMembers', () => {
  it('R5 → R4 → 一般成員，組內戰力遞減，未填戰力墊底', () => {
    const sorted = sortAllianceMembers([
      member('a', 'member', 50),
      member('b', 'member', null),
      member('c', 'r4', 10),
      member('d', 'r5', 1),
      member('e', 'r4', 99),
      member('f', 'member', 80),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['d', 'e', 'c', 'f', 'a', 'b']);
  });

  it('同戰力依名稱，再依固定 ID', () => {
    const sorted = sortAllianceMembers([
      member('z2', 'member', 5, 'Bob'),
      member('z1', 'member', 5, 'Bob'),
      member('y', 'member', 5, 'Amy'),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['y', 'z1', 'z2']);
  });
});

describe('normalizeMemberInput', () => {
  it('去除空白並接受千分位戰力', () => {
    expect(normalizeMemberInput({ name: '  Ann ', power: '1,234', rank: 'r4' }))
      .toEqual({ ok: true, value: { name: 'Ann', power: 1234, rank: 'r4' } });
  });

  it('戰力可留空', () => {
    expect(normalizeMemberInput({ name: 'Ann', power: ' ', rank: 'member' }))
      .toEqual({ ok: true, value: { name: 'Ann', power: null, rank: 'member' } });
  });

  it.each([
    [{ name: '   ', power: '', rank: 'member' as const }, 'name-required'],
    [{ name: 'x'.repeat(101), power: '', rank: 'member' as const }, 'name-too-long'],
    [{ name: 'Ann', power: '-1', rank: 'member' as const }, 'power-invalid'],
    [{ name: 'Ann', power: '1.5', rank: 'member' as const }, 'power-invalid'],
    [{ name: 'Ann', power: '9007199254740992', rank: 'member' as const }, 'power-invalid'],
  ])('拒絕不合法輸入 %#', (draft, error) => {
    expect(normalizeMemberInput(draft)).toEqual({ ok: false, error });
  });
});

describe('hasDuplicateName', () => {
  it('忽略大小寫並排除自己', () => {
    const members = [member('a', 'member', 1, 'Ann')];
    expect(hasDuplicateName(members, ' ann ')).toBe(true);
    expect(hasDuplicateName(members, 'ann', 'a')).toBe(false);
  });
});

describe('mergeSeason', () => {
  it('新成員立即出現且狀態預設未勾選，序號依排序產生', () => {
    const { koi } = mergeSeason(
      [member('m1', 'member', 10), member('m2', 'r5', 5)],
      [record('m1', 'koi', { kick: true, note: '保留' })],
    );
    expect(koi.map((item) => [item.id, item.number])).toEqual([['m2', 1], ['m1', 2]]);
    expect(koi[0]).toMatchObject({ kick: false, note: '', hasRecord: false, rank: 'R5' });
    expect(koi[1]).toMatchObject({ kick: true, note: '保留', hasRecord: true, rank: undefined });
  });

  it('改名只讀主檔，轉移狀態與備註維持原值', () => {
    const { koi } = mergeSeason(
      [member('m1', 'member', 10, '新名字')],
      [record('m1', 'koi', { name: '舊名字', removed: true, note: 'n' })],
    );
    expect(koi[0]).toMatchObject({ name: '新名字', removed: true, note: 'n' });
  });

  it('刪除主檔後不再顯示或計數，已勾踢除也不重複扣除', () => {
    const { koi } = mergeSeason(
      [member('m1', 'member', 10)],
      [record('m1', 'koi'), record('gone', 'koi', { kick: true, removed: true })],
    );
    expect(koi.map((item) => item.id)).toEqual(['m1']);
  });

  it('轉入者建立主檔後只留在轉入區；主檔刪除時也移出轉入區', () => {
    const linkedId = linkedMemberId('ev', 'bdk-001');
    const records = [
      record('bdk-001', 'bdk', { transferred: true, allianceMemberId: linkedId }),
      record('bdk-002', 'bdk', { number: 2 }),
    ];
    const withMaster = mergeSeason([member(linkedId, 'member', 3), member('m1', 'member', 1)], records);
    expect(withMaster.koi.map((item) => item.id)).toEqual(['m1']);
    expect(withMaster.bdk.map((item) => item.id)).toEqual(['bdk-001', 'bdk-002']);

    const deleted = mergeSeason([member('m1', 'member', 1)], records);
    expect(deleted.koi.map((item) => item.id)).toEqual(['m1']);
    expect(deleted.bdk.map((item) => item.id)).toEqual(['bdk-002']);
  });
});

describe('joinableTransfers', () => {
  it('只列已加入且尚未建立主檔的轉入者', () => {
    const records = [
      record('bdk-001', 'bdk', { transferred: true }),
      record('bdk-002', 'bdk', { transferred: false }),
      record('bdk-003', 'bdk', { transferred: true, allianceMemberId: 'ev--bdk-003' }),
      record('bdk-004', 'bdk', { transferred: true }),
      record('m1', 'koi', { transferred: true }),
    ];
    const result = joinableTransfers([member('ev--bdk-004', 'member', 1)], records, 'ev');
    expect(result.map((item) => item.id)).toEqual(['bdk-001']);
  });
});
