/**
 * 把 .transfer-seed.local.json 寫入 Firestore，建立新賽季。
 *
 *   npm run seed:transfer                      # 建立賽季、邀請與外部名單
 *   npm run seed:transfer -- --set-maintainer  # 同時把聯盟名單維護權限移到這個賽季
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient, parseFlags, projectRoot } from './lib/firestoreRest.mjs';

const { flags } = parseFlags(process.argv.slice(2));
const seed = JSON.parse(await fs.readFile(path.join(projectRoot, '.transfer-seed.local.json'), 'utf8'));
const client = await createClient();
const allianceId = seed.event.allianceId ?? 'koi';

if (await client.getDocument(`transferEvents/${seed.event.id}`)) {
  throw new Error(`活動 ${seed.event.id} 已存在，為避免覆蓋雲端勾選與備註，本次未寫入任何資料。`);
}
const alliance = await client.getDocument(`alliances/${allianceId}`);
if (!alliance) {
  throw new Error(`找不到聯盟主檔 alliances/${allianceId}，請先執行 npm run migrate:alliance。`);
}

const createdAt = new Date().toISOString();
const eventPath = `transferEvents/${seed.event.id}`;
const event = { ...seed.event, createdAt };
// Rules 要用時間比較，結束時間必須存成 Timestamp，不能是字串
if (event.closesAt) event.closesAt = new Date(event.closesAt);
const writes = [client.createWrite(eventPath, event)];

for (const [role, token] of Object.entries(seed.invites)) {
  writes.push(client.createWrite(`transferInvites/${token}`, {
    eventId: seed.event.id,
    role,
    active: true,
    createdAt,
  }));
}

writes.push(client.createWrite(`${eventPath}/admin/invites`, seed.invites));
for (const member of seed.members) {
  const { id, ...data } = member;
  writes.push(client.createWrite(`${eventPath}/members/${id}`, data));
}
if (flags['set-maintainer'] === true) {
  writes.push(client.patchWrite(`alliances/${allianceId}`, { maintainerEventId: seed.event.id }));
}

await client.commit(writes);

const baseUrl = 'https://rushbq.github.io/LFtime/#/transfer/';
console.log(`已寫入 Firebase 專案 ${client.projectId}：外部名單 ${seed.members.length} 位，${writes.length} 筆文件。`);
console.log(flags['set-maintainer'] === true
  ? `聯盟名單維護權限已移到 ${seed.event.id}。`
  : `聯盟名單維護權限仍在 ${alliance.maintainerEventId}。`);
console.log(`R5  ${baseUrl}${seed.invites.r5}`);
console.log(`R4  ${baseUrl}${seed.invites.r4}`);
console.log(`Adm ${baseUrl}${seed.invites.adm}`);
