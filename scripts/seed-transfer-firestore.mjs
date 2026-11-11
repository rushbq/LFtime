/**
 * 把 .transfer-seed.local.json 寫入 Firestore，建立新賽季與外部名單。
 * 編輯邀請綁聯盟、不綁賽季，既有連結直接適用新賽季，不需要另外產生。
 *
 *   npm run seed:transfer
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient, projectRoot } from './lib/firestoreRest.mjs';

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

for (const member of seed.members) {
  const { id, ...data } = member;
  writes.push(client.createWrite(`${eventPath}/members/${id}`, data));
}

await client.commit(writes);

console.log(`已寫入 Firebase 專案 ${client.projectId}：外部名單 ${seed.members.length} 位，${writes.length} 筆文件。`);
console.log(`賽季網址：https://rushbq.github.io/LFtime/#/transfer/season/${seed.event.id}`);
