import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const seedPath = path.join(projectRoot, '.transfer-seed.local.json');
const firebaseRcPath = path.join(projectRoot, '.firebaserc');
const firebaseRc = JSON.parse(await fs.readFile(firebaseRcPath, 'utf8'));
const projectId = process.env.FIREBASE_PROJECT_ID ?? firebaseRc.projects?.default;

if (!projectId) {
  throw new Error('請先設定 FIREBASE_PROJECT_ID 環境變數。');
}

const getFirebaseCliAccessToken = async () => {
  const cliConfigPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const cliConfig = JSON.parse(await fs.readFile(cliConfigPath, 'utf8'));
  const { access_token: accessToken, expires_at: expiresAt } = cliConfig.tokens ?? {};
  if (!accessToken || !expiresAt || expiresAt <= Date.now()) {
    throw new Error('Firebase CLI 登入已過期，請先執行 firebase projects:list 更新登入狀態。');
  }

  return accessToken;
};

const seed = JSON.parse(await fs.readFile(seedPath, 'utf8'));
const accessToken = await getFirebaseCliAccessToken();
const databaseRoot = `projects/${projectId}/databases/(default)/documents`;
const eventName = `${databaseRoot}/transferEvents/${seed.event.id}`;
const eventResponse = await fetch(`https://firestore.googleapis.com/v1/${eventName}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});

if (eventResponse.ok) {
  throw new Error(`活動 ${seed.event.id} 已存在，為避免覆蓋雲端勾選與備註，本次未寫入任何資料。`);
}
if (eventResponse.status !== 404) {
  throw new Error(`檢查既有活動失敗：HTTP ${eventResponse.status} ${await eventResponse.text()}`);
}

const toFirestoreValue = (value) => {
  if (value === null) return { nullValue: 'NULL_VALUE' };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'object') return { mapValue: { fields: toFirestoreFields(value) } };
  throw new Error(`不支援的 Firestore 資料型別：${typeof value}`);
};

const toFirestoreFields = (record) => Object.fromEntries(
  Object.entries(record).map(([key, value]) => [key, toFirestoreValue(value)]),
);

const createWrite = (name, data) => ({
  update: { name, fields: toFirestoreFields(data) },
  currentDocument: { exists: false },
});

const createdAt = new Date().toISOString();
const writes = [
  createWrite(eventName, { ...seed.event, createdAt }),
];

for (const [role, token] of Object.entries(seed.invites)) {
  writes.push(createWrite(`${databaseRoot}/transferInvites/${token}`, {
    eventId: seed.event.id,
    role,
    active: true,
    createdAt,
  }));
}

writes.push(createWrite(`${eventName}/admin/invites`, seed.invites));
for (const member of seed.members) {
  const { id, ...data } = member;
  writes.push(createWrite(`${eventName}/members/${id}`, data));
}

const commitResponse = await fetch(
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  },
);

if (!commitResponse.ok) {
  throw new Error(`Firestore 寫入失敗：HTTP ${commitResponse.status} ${await commitResponse.text()}`);
}

const baseUrl = 'https://rushbq.github.io/LFtime/#/transfer/';
console.log(`已寫入 Firebase 專案 ${projectId}：${seed.members.length} 位玩家，${writes.length} 筆文件。`);
console.log(`R5  ${baseUrl}${seed.invites.r5}`);
console.log(`R4  ${baseUrl}${seed.invites.r4}`);
console.log(`Adm ${baseUrl}${seed.invites.adm}`);
