/**
 * 建立聯盟的兩條編輯邀請（呆萌小星／聰明的史努比），並可清除舊版「每季三條邀請」的資料。
 *
 *   npm run setup:invites                               # 預覽（預設）：只印出將要做的事
 *   npm run setup:invites -- --apply                    # 沒有邀請時建立兩條；已有就印出現有連結
 *   npm run setup:invites -- --apply --renew            # 兩條都換新，舊連結立即失效
 *   npm run setup:invites -- --apply --cleanup-legacy   # 另外刪除舊版邀請、參與者、管理資料與 maintainerEventId
 *
 * 選項：--alliance-id=koi --base-url=https://rushbq.github.io/LFtime/
 * 邀請碼本身就是編輯權限：終端機輸出不要截圖外流，只把對應連結傳給對應的人。
 */
import { randomBytes } from 'node:crypto';
import { createClient, parseFlags } from './lib/firestoreRest.mjs';

const ROLES = { xiaoxing: '呆萌小星', snoopy: '聰明的史努比' };

const { flags } = parseFlags(process.argv.slice(2));
const apply = flags.apply === true;
const renew = flags.renew === true;
const cleanupLegacy = flags['cleanup-legacy'] === true;
const allianceId = typeof flags['alliance-id'] === 'string' ? flags['alliance-id'] : 'koi';
const baseUrl = typeof flags['base-url'] === 'string' ? flags['base-url'] : 'https://rushbq.github.io/LFtime/';

const client = await createClient();
console.log(`Firebase 專案：${client.projectId}${client.emulator ? '（Emulator）' : ''}`);

const alliance = await client.getDocument(`alliances/${allianceId}`);
if (!alliance) throw new Error(`找不到聯盟主檔 alliances/${allianceId}`);

const writes = [];
const current = await client.getDocument(`alliances/${allianceId}/admin/invites`);
let invites = current && typeof current.xiaoxing === 'string' && typeof current.snoopy === 'string' ? current : null;

if (invites && !renew) {
  console.log('已有兩條編輯邀請，不變更（要換新請加 --renew）。');
} else {
  const createdAt = new Date();
  const next = Object.fromEntries(Object.keys(ROLES).map((role) => [role, randomBytes(24).toString('base64url')]));
  for (const [role, token] of Object.entries(next)) {
    writes.push(client.createWrite(`allianceInvites/${token}`, { allianceId, role, active: true, createdAt }));
  }
  if (invites) {
    for (const role of Object.keys(ROLES)) {
      writes.push(client.patchWrite(`allianceInvites/${invites[role]}`, { active: false }));
    }
  }
  // admin/invites 換新時已存在，整份覆寫
  writes.push(client.setWrite(`alliances/${allianceId}/admin/invites`, next));
  console.log(invites ? '將換新兩條編輯邀請，舊連結停用。' : '將建立兩條編輯邀請。');
  invites = next;
}

if (cleanupLegacy) {
  const legacyInvites = await client.listDocuments('transferInvites');
  const events = await client.listDocuments('transferEvents');
  let legacyCount = legacyInvites.length;
  for (const { id } of legacyInvites) writes.push(client.deleteWrite(`transferInvites/${id}`));
  for (const event of events) {
    for (const sub of ['participants', 'admin']) {
      const docs = await client.listDocuments(`transferEvents/${event.id}/${sub}`);
      legacyCount += docs.length;
      for (const { id } of docs) writes.push(client.deleteWrite(`transferEvents/${event.id}/${sub}/${id}`));
    }
  }
  if ('maintainerEventId' in alliance) {
    writes.push(client.removeFieldsWrite(`alliances/${allianceId}`, ['maintainerEventId']));
    legacyCount += 1;
  }
  console.log(`將清除舊版資料 ${legacyCount} 筆（每季邀請、參與者、管理資料、maintainerEventId）。`);
}

if (!apply) {
  console.log(`預覽模式：共 ${writes.length} 筆寫入，未寫入。確認後加上 --apply。`);
} else {
  if (writes.length > 0) await client.commit(writes);
  console.log(`已寫入 ${writes.length} 筆。`);
  for (const [role, label] of Object.entries(ROLES)) {
    console.log(`${label}  ${baseUrl}#/transfer/join/${invites[role]}`);
  }
}
