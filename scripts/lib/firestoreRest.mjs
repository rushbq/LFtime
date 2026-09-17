import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** 管理腳本共用：沿用 Firebase CLI 登入，透過 Firestore REST API 讀寫（不經 Security Rules） */

export const projectRoot = path.resolve(import.meta.dirname, '..', '..');

export const resolveProjectId = async () => {
  const firebaseRc = JSON.parse(await fs.readFile(path.join(projectRoot, '.firebaserc'), 'utf8'));
  const projectId = process.env.FIREBASE_PROJECT_ID ?? firebaseRc.projects?.default;
  if (!projectId) throw new Error('請先設定 FIREBASE_PROJECT_ID 環境變數。');
  return projectId;
};

export const getFirebaseCliAccessToken = async () => {
  const cliConfigPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const cliConfig = JSON.parse(await fs.readFile(cliConfigPath, 'utf8'));
  const { access_token: accessToken, expires_at: expiresAt } = cliConfig.tokens ?? {};
  if (!accessToken || !expiresAt || expiresAt <= Date.now()) {
    throw new Error('Firebase CLI 登入已過期，請先執行 firebase projects:list 更新登入狀態。');
  }
  return accessToken;
};

export const toFirestoreValue = (value) => {
  if (value === null) return { nullValue: 'NULL_VALUE' };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'object') return { mapValue: { fields: toFirestoreFields(value) } };
  throw new Error(`不支援的 Firestore 資料型別：${typeof value}`);
};

export const toFirestoreFields = (record) => Object.fromEntries(
  Object.entries(record).map(([key, value]) => [key, toFirestoreValue(value)]),
);

export const fromFirestoreValue = (value) => {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(fromFirestoreValue);
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields ?? {});
  return null;
};

export const fromFirestoreFields = (fields = {}) => Object.fromEntries(
  Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]),
);

export const createClient = async () => {
  const projectId = await resolveProjectId();
  const accessToken = await getFirebaseCliAccessToken();
  const databaseRoot = `projects/${projectId}/databases/(default)/documents`;
  const headers = { Authorization: `Bearer ${accessToken}` };

  /** 讀單一文件；不存在回傳 null */
  const getDocument = async (relativePath) => {
    const response = await fetch(`https://firestore.googleapis.com/v1/${databaseRoot}/${relativePath}`, { headers });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`讀取 ${relativePath} 失敗：HTTP ${response.status} ${await response.text()}`);
    return fromFirestoreFields((await response.json()).fields);
  };

  /** 列出集合內全部文件（自動翻頁），回傳 [{ id, data }] */
  const listDocuments = async (collectionPath) => {
    const documents = [];
    let pageToken = '';
    do {
      const query = new URLSearchParams({ pageSize: '300', ...(pageToken ? { pageToken } : {}) });
      const response = await fetch(`https://firestore.googleapis.com/v1/${databaseRoot}/${collectionPath}?${query}`, { headers });
      if (!response.ok) throw new Error(`列出 ${collectionPath} 失敗：HTTP ${response.status} ${await response.text()}`);
      const body = await response.json();
      for (const document of body.documents ?? []) {
        documents.push({ id: document.name.split('/').pop(), data: fromFirestoreFields(document.fields) });
      }
      pageToken = body.nextPageToken ?? '';
    } while (pageToken);
    return documents;
  };

  /** 每批最多 500 筆；單批內原子寫入 */
  const commit = async (writes) => {
    for (let index = 0; index < writes.length; index += 500) {
      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ writes: writes.slice(index, index + 500) }),
        },
      );
      if (!response.ok) throw new Error(`Firestore 寫入失敗：HTTP ${response.status} ${await response.text()}`);
    }
  };

  const name = (relativePath) => `${databaseRoot}/${relativePath}`;

  /** 只在文件不存在時建立 */
  const createWrite = (relativePath, data) => ({
    update: { name: name(relativePath), fields: toFirestoreFields(data) },
    currentDocument: { exists: false },
  });

  /** 只更新指定欄位，文件必須已存在 */
  const patchWrite = (relativePath, data) => ({
    update: { name: name(relativePath), fields: toFirestoreFields(data) },
    updateMask: { fieldPaths: Object.keys(data) },
    currentDocument: { exists: true },
  });

  return { projectId, getDocument, listDocuments, commit, createWrite, patchWrite };
};

/** 解析 --key=value 參數 */
export const parseFlags = (argv) => {
  const flags = {};
  const positional = [];
  for (const argument of argv) {
    const match = argument.match(/^--([^=]+)(?:=(.*))?$/);
    if (match) flags[match[1]] = match[2] ?? true;
    else positional.push(argument);
  }
  return { flags, positional };
};
