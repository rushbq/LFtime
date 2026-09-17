import { Alliance, AllianceMember, TransferInviteSet, TransferMember, TransferRole, TransferSession } from './types';

const PREVIEW_EVENT_ID = 'preview-koi-bdk-2609';

const buildAllianceMembers = (): AllianceMember[] => Array.from({ length: 77 }, (_, index) => ({
  id: `preview-koi-${index + 1}`,
  name: `KOi Player ${String(index + 1).padStart(2, '0')}`,
  power: index === 76 ? null : 158_000_000 - index * 937_421,
  rank: index === 0 ? 'r5' : index < 10 ? 'r4' : 'member',
  version: 1,
}));

const buildKoiRecords = (): TransferMember[] => Array.from({ length: 40 }, (_, index) => ({
  id: `preview-koi-${index + 1}`,
  list: 'koi',
  number: index + 1,
  name: '',
  kick: index >= 10 && index < 25,
  backup: index >= 31 && index < 38,
  removed: index >= 10 && index < 15,
  transferred: false,
  note: index === 17 ? '等待本人確認上線時間' : '',
  updatedAt: index === 17 ? Date.now() - 18 * 60_000 : null,
  updatedBy: index === 17 ? 'r4' : null,
}));

const buildBdkRecords = (): TransferMember[] => Array.from({ length: 31 }, (_, index) => ({
  id: `preview-bdk-${index + 1}`,
  list: 'bdk',
  number: index + 1,
  name: `BDK Player ${String(index + 1).padStart(2, '0')}`,
  kick: false,
  backup: false,
  removed: false,
  transferred: index < 8,
  note: index === 8 ? '第二批轉入' : '',
  updatedAt: index === 8 ? Date.now() - 7 * 60_000 : null,
  updatedBy: index === 8 ? 'r5' : null,
}));

export const getTransferPreview = (role: TransferRole): {
  session: TransferSession;
  alliance: Alliance;
  allianceMembers: AllianceMember[];
  records: TransferMember[];
  invites: TransferInviteSet;
} => ({
  session: {
    eventId: PREVIEW_EVENT_ID,
    role,
    event: {
      id: PREVIEW_EVENT_ID,
      title: 'KOi × BDK 賽季轉移',
      titleEn: 'KOi × BDK Season Transfer',
      capacity: 90,
      active: true,
      allianceId: 'koi',
      externalName: 'BDK',
    },
  },
  alliance: { id: 'koi', name: 'KOi', maintainerEventId: PREVIEW_EVENT_ID },
  allianceMembers: buildAllianceMembers(),
  records: [...buildKoiRecords(), ...buildBdkRecords()],
  invites: {
    r5: 'preview-r5-invite-link-000000000001',
    r4: 'preview-r4-invite-link-000000000002',
    adm: 'preview-adm-invite-link-00000000003',
  },
});
