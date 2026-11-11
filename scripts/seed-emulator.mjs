/**
 * 本機 Emulator 測試資料：聯盟主檔、兩個賽季、兩條編輯邀請、管理密碼 emulator-password。只寫 Emulator，不碰正式資料。
 *
 *   npm run emulator        # 另一個終端機先啟動 Firestore／Auth Emulator
 *   npm run seed:emulator   # 寫入測試資料並印出邀請連結
 *   npm run dev:emulator    # 前端連到 Emulator
 */
import { createClient } from './lib/firestoreRest.mjs';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_PROJECT_ID ??= 'demo-lftime';
if (!process.env.FIREBASE_PROJECT_ID.startsWith('demo-')) throw new Error('只能寫入 demo- 開頭的 Emulator 專案。');

const client = await createClient();
const now = new Date();
const day = 86_400_000;
const writes = [client.setWrite('alliances/koi', { name: 'KOi' })];

for (let index = 0; index < 60; index += 1) {
  writes.push(client.setWrite(`alliances/koi/members/m${String(index + 1).padStart(2, '0')}`, {
    name: `KOi Player ${String(index + 1).padStart(2, '0')}`,
    power: 150_000_000 - index * 1_000_000,
    rank: index === 0 ? 'r5' : index < 6 ? 'r4' : 'member',
    version: 1, createdAt: now, updatedAt: now,
  }));
}

const seasons = [
  { id: 'koi-xyz-2612', title: 'KOi × XYZ 賽季轉移', titleEn: 'KOi × XYZ Season Transfer', externalName: 'XYZ', closesAt: new Date(now.getTime() + 7 * day), createdAt: now },
  { id: 'koi-bdk-2609', title: 'KOi × BDK 賽季轉移', externalName: 'BDK', closesAt: new Date(now.getTime() - 60 * day), createdAt: new Date(now.getTime() - 90 * day) },
];
for (const { id, ...event } of seasons) {
  writes.push(client.setWrite(`transferEvents/${id}`, { ...event, capacity: 90, active: true, allianceId: 'koi' }));
  for (let index = 0; index < 40; index += 1) {
    writes.push(client.setWrite(`transferEvents/${id}/members/ext-${String(index + 1).padStart(3, '0')}`, {
      list: 'bdk', number: index + 1, name: `${event.externalName} Player ${index + 1}`,
      kick: false, backup: false, removed: false, transferred: index < 5, note: '', updatedAt: now, updatedBy: 'xiaoxing',
    }));
  }
  // 我方：8 人踢除、4 人候補，其中一位有備註（查看模式不應顯示）
  for (let index = 40; index < 52; index += 1) {
    writes.push(client.setWrite(`transferEvents/${id}/members/m${index + 1}`, {
      list: 'koi', kick: index < 48, backup: index >= 48, removed: index < 42, transferred: false,
      note: index === 45 ? '私人備註：等本人確認' : '', updatedAt: now, updatedBy: index % 2 ? 'snoopy' : 'r5',
    }));
  }
}

const invites = { xiaoxing: 'emulator-xiaoxing-invite-token-0001', snoopy: 'emulator-snoopy-invite-token-00002' };
for (const [role, token] of Object.entries(invites)) {
  writes.push(client.setWrite(`allianceInvites/${token}`, { allianceId: 'koi', role, active: true, createdAt: now }));
}
writes.push(client.setWrite('alliances/koi/admin/invites', invites));
// 賽季管理頁密碼（僅 Emulator 用）
writes.push(client.setWrite('adminKeys/emulator-password', { allianceId: 'koi', createdAt: now }));

await client.commit(writes);
console.log(`已寫入 Emulator（${client.projectId}）${writes.length} 筆。`);
console.log(`呆萌小星      http://localhost:5173/LFtime/#/transfer/join/${invites.xiaoxing}`);
console.log(`聰明的史努比  http://localhost:5173/LFtime/#/transfer/join/${invites.snoopy}`);
