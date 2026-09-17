/**
 * 聯盟名單移轉：把既有賽季的 KOi 清單複製成聯盟主檔，並補上賽季的聯盟設定。
 *
 *   npm run migrate:alliance                 # 預覽（預設）：讀雲端、寫本機備份、印出摘要，不寫入
 *   npm run migrate:alliance -- --apply      # 實際寫入
 *
 * 選項：--event-id=koi-bdk-2609 --alliance-id=koi --alliance-name=KOi --external-name=BDK
 *
 * 重跑安全：聯盟文件已存在就完全不碰主檔（避免把人工刪除的人加回來、蓋掉人工修改）；
 * 賽季只補缺少的欄位；不重建邀請碼、不改任何轉移判斷與備註。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient, parseFlags, projectRoot } from './lib/firestoreRest.mjs';

const { flags } = parseFlags(process.argv.slice(2));
const apply = flags.apply === true;
const eventId = flags['event-id'] ?? 'koi-bdk-2609';
const allianceId = flags['alliance-id'] ?? 'koi';
const allianceName = flags['alliance-name'] ?? 'KOi';
const externalName = flags['external-name'] ?? 'BDK';

const client = await createClient();
const event = await client.getDocument(`transferEvents/${eventId}`);
if (!event) throw new Error(`找不到賽季 ${eventId}`);

const [records, alliance, allianceMembers] = await Promise.all([
  client.listDocuments(`transferEvents/${eventId}/members`),
  client.getDocument(`alliances/${allianceId}`),
  client.listDocuments(`alliances/${allianceId}/members`),
]);

// 備份一定先寫，預覽模式也寫；目錄已列入 .gitignore
const backupDir = path.join(projectRoot, '.transfer-backup');
await fs.mkdir(backupDir, { recursive: true });
const backupPath = path.join(backupDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${eventId}.json`);
await fs.writeFile(
  backupPath,
  `${JSON.stringify({ projectId: client.projectId, eventId, event, records, alliance, allianceMembers }, null, 2)}\n`,
  { encoding: 'utf8', mode: 0o600 },
);

const toRank = (rank) => rank === 'R5' ? 'r5' : rank === 'R4' ? 'r4' : 'member';
const warnings = [];
const koi = records.filter((record) => record.data.list === 'koi');
const writes = [];
const now = new Date();

if (alliance) {
  console.log(`聯盟文件 alliances/${allianceId} 已存在（主檔 ${allianceMembers.length} 人），不覆寫主檔。`);
} else {
  writes.push(client.createWrite(`alliances/${allianceId}`, { name: allianceName, maintainerEventId: eventId }));
  for (const { id, data } of koi) {
    const name = String(data.name ?? '').trim();
    if (!name) warnings.push(`${id}：名稱空白`);
    if (name.length > 100) warnings.push(`${id}：名稱超過 100 字，之後網頁無法編輯這位成員`);
    const power = Number.isSafeInteger(data.power) && data.power >= 0 ? data.power : null;
    if (data.power !== undefined && power === null) warnings.push(`${id}：戰力 ${data.power} 不合法，改為留空`);
    // 只帶公開欄位；踢除、候補、備註等私人紀錄留在賽季文件
    writes.push(client.createWrite(`alliances/${allianceId}/members/${id}`, {
      name, power, rank: toRank(data.rank), version: 1, createdAt: now, updatedAt: now,
    }));
  }
}

const eventPatch = {
  ...(event.allianceId === undefined ? { allianceId } : {}),
  ...(event.externalName === undefined ? { externalName } : {}),
};
if (Object.keys(eventPatch).length > 0) {
  writes.push(client.patchWrite(`transferEvents/${eventId}`, eventPatch));
}

const rankCount = (rank) => koi.filter((record) => toRank(record.data.rank) === rank).length;
console.log(`Firebase 專案：${client.projectId}`);
console.log(`備份：${backupPath}`);
console.log(`賽季 ${eventId}：KOi 紀錄 ${koi.length} 筆、外部聯盟紀錄 ${records.length - koi.length} 筆`);
if (!alliance) {
  console.log(`將建立聯盟主檔 ${koi.length} 人（R5 ${rankCount('r5')}、R4 ${rankCount('r4')}、一般成員 ${rankCount('member')}），沿用原 ID`);
  console.log(`維護權限來源賽季：${eventId}`);
}
console.log(Object.keys(eventPatch).length > 0
  ? `賽季將補上：${JSON.stringify(eventPatch)}`
  : '賽季設定已齊全，不修改。');
for (const warning of warnings) console.warn(`⚠ ${warning}`);

if (writes.length === 0) {
  console.log('沒有需要寫入的資料。');
} else if (!apply) {
  console.log(`預覽模式：共 ${writes.length} 筆寫入，未寫入雲端。確認後加上 --apply。`);
} else {
  await client.commit(writes);
  console.log(`已寫入 ${writes.length} 筆。`);
}
