import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, connectAuthEmulator, getAuth, signInAnonymously, User } from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  deleteField,
  doc,
  DocumentData,
  Firestore,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Alliance,
  AllianceMember,
  EditorSession,
  ROLES,
  SeasonSettings,
  SeasonSummary,
  TransferEvent,
  TransferInviteSet,
  TransferMember,
  TransferMemberChanges,
  TransferRole,
} from '../features/transfer/types';
import { TransferErrorCode } from '../features/transfer/i18n';
import { linkedMemberId, MemberInput } from '../features/transfer/allianceModel';

/** 服務層只負責「出了什麼事」，顯示成哪種語言由 UI 決定 */
export class TransferError extends Error {
  constructor(readonly code: TransferErrorCode, readonly detail?: string) {
    super(code);
    this.name = 'TransferError';
  }
}

type Failure = { code: TransferErrorCode; detail?: string };

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

const missingConfig = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

/** 本機驗證用：npm run dev:emulator 會連到 Firebase Emulator，不碰正式資料 */
const useEmulator = import.meta.env.VITE_USE_EMULATOR === 'true';

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firestore: Firestore | null = null;

const ensureApp = () => {
  if (missingConfig.length > 0) {
    throw new TransferError('config-missing', missingConfig.join('、'));
  }
  if (!firebaseApp) {
    firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  return firebaseApp;
};

const ensureAuth = (app: FirebaseApp) => {
  if (!firebaseAuth) {
    firebaseAuth = getAuth(app);
    if (useEmulator) connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
  return firebaseAuth;
};

const ensureFirestore = (app: FirebaseApp) => {
  if (!firestore) {
    firestore = getFirestore(app);
    if (useEmulator) connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  }
  return firestore;
};

/**
 * 先完成匿名登入並確定拿到 token，才建立 Firestore。
 *
 * 順序很重要：第一次造訪時瀏覽器沒有既有的匿名身分，若先建立 Firestore
 * 再登入，連線會在還沒有憑證的狀態下開啟，名單監聽的第一個 snapshot
 * 就可能一直不回來。重新整理之所以會好，
 * 是因為匿名身分已存在 IndexedDB，Firestore 一建立就帶得到 token。
 */
let connecting: Promise<{ db: Firestore; user: User }> | null = null;

const connectFirebase = () => {
  // 同時有多個連線流程（StrictMode 重跑 effect、頁面切換）時共用同一次登入，
  // 否則會各自建立匿名身分，後登入的覆蓋前者，先前流程的讀寫就被 Rules 拒絕
  connecting ??= (async () => {
    const app = ensureApp();
    const auth = ensureAuth(app);

    await auth.authStateReady();
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    await user.getIdToken();

    return { db: ensureFirestore(app), user };
  })().catch((error) => {
    connecting = null;
    throw error;
  });
  return connecting;
};

/**
 * 公開查看（賽季、名單、聯盟名單）不需要登入，也不替每位訪客建立匿名身分。
 * 仍先等既有登入狀態還原，理由同 connectFirebase：避免 Firestore 在憑證未定時建立。
 */
const connectPublic = async () => {
  const app = ensureApp();
  await ensureAuth(app).authStateReady();
  return ensureFirestore(app);
};

const requireDb = () => {
  if (!firestore) throw new TransferError('not-connected');
  return firestore;
};

const asRole = (value: unknown): TransferRole => {
  if (ROLES.includes(value as TransferRole)) return value as TransferRole;
  throw new TransferError('invite-no-role');
};

const timestampToMillis = (value: unknown): number | null =>
  value instanceof Timestamp ? value.toMillis() : null;

const mapMember = (id: string, data: DocumentData): TransferMember => ({
  id,
  list: data.list === 'bdk' ? 'bdk' : 'koi',
  number: typeof data.number === 'number' ? data.number : 0,
  name: typeof data.name === 'string' ? data.name : '',
  power: typeof data.power === 'number' ? data.power : undefined,
  rank: typeof data.rank === 'string' ? data.rank : undefined,
  kick: data.kick === true,
  backup: data.backup === true,
  removed: data.removed === true,
  transferred: data.transferred === true,
  note: typeof data.note === 'string' ? data.note : '',
  updatedAt: timestampToMillis(data.updatedAt),
  updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : null,
  ...(typeof data.allianceMemberId === 'string' ? { allianceMemberId: data.allianceMemberId } : {}),
});

const mapAllianceMember = (id: string, data: DocumentData): AllianceMember => ({
  id,
  name: typeof data.name === 'string' ? data.name : '',
  power: typeof data.power === 'number' ? data.power : null,
  rank: data.rank === 'r5' || data.rank === 'r4' ? data.rank : 'member',
  version: typeof data.version === 'number' ? data.version : 0,
});

/** 把任何錯誤收斂成一個代碼，UI 再決定要用哪種語言顯示 */
const toCode = (error: unknown): Failure => {
  if (error instanceof TransferError) return { code: error.code, detail: error.detail };
  const message = error instanceof Error ? error.message : String(error);
  // FirebaseError 的 message 是英文說明，代碼在 code 欄位
  const firebaseCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (firebaseCode === 'permission-denied' || message.includes('permission-denied')) return { code: 'permission-denied' };
  if (firebaseCode === 'unavailable' || message.includes('unavailable')) return { code: 'unavailable' };
  return { code: 'unknown', detail: message };
};

export const toTransferError = toCode;

const mapEvent = (id: string, data: DocumentData): TransferEvent => ({
  id,
  title: typeof data.title === 'string' ? data.title : 'Season Transfer',
  titleEn: typeof data.titleEn === 'string' ? data.titleEn : undefined,
  capacity: typeof data.capacity === 'number' ? data.capacity : 90,
  active: data.active === true,
  closesAt: typeof data.closesAt?.toMillis === 'function' ? data.closesAt.toMillis() : undefined,
  allianceId: typeof data.allianceId === 'string' ? data.allianceId : 'koi',
  externalName: typeof data.externalName === 'string' ? data.externalName : 'BDK',
});

/** 公開監聽：先連線再開始監聽，回傳可隨時呼叫的取消函式 */
const listenPublic = (start: (db: Firestore) => () => void, onError: (failure: Failure) => void) => {
  let disposed = false;
  let stop = () => undefined as void;
  connectPublic()
    .then((db) => { if (!disposed) stop = start(db); })
    .catch((error) => { if (!disposed) onError(toCode(error)); });
  return () => { disposed = true; stop(); };
};

/* ---------------- 編輯身分 ---------------- */

/** 同一個邀請碼在這次開頁中只驗證一次，切換頁面不重複寫入編輯身分 */
const joins = new Map<string, Promise<EditorSession>>();

/** 驗證聯盟邀請碼並建立這台裝置的編輯身分；適用該聯盟所有賽季 */
export const joinAlliance = (inviteToken: string): Promise<EditorSession> => {
  const cached = joins.get(inviteToken);
  if (cached) return cached;
  const pending = (async () => {
    const { db, user } = await connectFirebase();
    const inviteSnapshot = await getDoc(doc(db, 'allianceInvites', inviteToken));
    if (!inviteSnapshot.exists()) throw new TransferError('invite-not-found');

    const invite = inviteSnapshot.data();
    if (invite.active !== true) throw new TransferError('invite-disabled');
    const allianceId = typeof invite.allianceId === 'string' ? invite.allianceId : '';
    const role = asRole(invite.role);
    if (!allianceId) throw new TransferError('invite-no-alliance');

    await setDoc(doc(db, 'alliances', allianceId, 'editors', user.uid), {
      allianceId,
      inviteId: inviteToken,
      role,
      joinedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    });
    return { allianceId, role, token: inviteToken };
  })();
  joins.set(inviteToken, pending);
  pending.catch(() => joins.delete(inviteToken));
  return pending;
};

/**
 * 以管理密碼解鎖賽季管理頁。密碼不在前端比對：寫入解鎖紀錄時由 Rules 確認
 * adminKeys/{密碼} 存在，被拒絕就是密碼錯誤。
 */
export const unlockAdmin = async (allianceId: string, password: string) => {
  const { db, user } = await connectFirebase();
  try {
    await setDoc(doc(db, 'alliances', allianceId, 'unlocked', user.uid), {
      key: password,
      unlockedAt: serverTimestamp(),
    });
  } catch (error) {
    if (toCode(error).code === 'permission-denied') throw new TransferError('admin-password-wrong');
    throw error;
  }
};

/** 這台裝置是否已用目前有效的管理密碼解鎖（換密碼後舊解鎖失效） */
export const isAdminUnlocked = async (allianceId: string) => {
  try {
    await loadInvites(allianceId);
    return true;
  } catch {
    return false;
  }
};

/** 兩條編輯邀請連結（限編輯者或管理密碼解鎖者讀取） */
export const loadInvites = async (allianceId: string): Promise<TransferInviteSet> => {
  const { db } = await connectFirebase();
  const snapshot = await getDoc(doc(db, 'alliances', allianceId, 'admin', 'invites'));
  if (!snapshot.exists()) throw new TransferError('invites-not-found');
  const data = snapshot.data();

  if (typeof data.xiaoxing !== 'string' || typeof data.snoopy !== 'string') {
    throw new TransferError('invites-incomplete');
  }

  return { xiaoxing: data.xiaoxing, snoopy: data.snoopy };
};

/** 邀請碼本身就是權限，用 192 bits 隨機值，與管理腳本相同長度 */
const createInviteToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** 換掉某個身分的連結：新連結生效、舊連結停用（已用舊連結進來的人立即失去權限） */
export const regenerateInvite = async (allianceId: string, role: TransferRole, current: TransferInviteSet) => {
  const db = requireDb();
  const token = createInviteToken();
  const next = { ...current, [role]: token };
  const batch = writeBatch(db);
  batch.set(doc(db, 'allianceInvites', token), { allianceId, role, active: true, createdAt: serverTimestamp() });
  batch.update(doc(db, 'allianceInvites', current[role]), { active: false });
  batch.set(doc(db, 'alliances', allianceId, 'admin', 'invites'), next);
  await batch.commit();
  return next;
};

/* ---------------- 賽季與名單 ---------------- */

/** 公開讀取單一賽季，設定變更（例如延長結束時間）會即時反映 */
export const subscribeSeason = (
  eventId: string,
  onEvent: (event: TransferEvent | null) => void,
  onError: (failure: Failure) => void,
) => listenPublic((db) => onSnapshot(
  doc(db, 'transferEvents', eventId),
  (snapshot) => onEvent(snapshot.exists() ? mapEvent(eventId, snapshot.data()) : null),
  (error) => onError(toCode(error)),
), onError);

export const subscribeTransferMembers = (
  eventId: string,
  onMembers: (members: TransferMember[]) => void,
  onError: (failure: Failure) => void,
) => listenPublic((db) => onSnapshot(
  collection(db, 'transferEvents', eventId, 'members'),
  (snapshot) => onMembers(
    snapshot.docs
      .map((member) => mapMember(member.id, member.data()))
      .sort((left, right) => left.list.localeCompare(right.list) || left.number - right.number),
  ),
  (error) => onError(toCode(error)),
), onError);

export const updateTransferMember = async (
  eventId: string,
  memberId: string,
  role: TransferRole,
  changes: TransferMemberChanges,
  /** 編輯前這位玩家的備註內容，用來偵測其他人是否同時改了備註 */
  expectedNote: string | null,
  /** false：聯盟新成員本季還沒有賽季紀錄，這次操作要順便建立 */
  hasRecord = true,
) => {
  const db = requireDb();
  const memberRef = doc(db, 'transferEvents', eventId, 'members', memberId);
  const update = {
    ...changes,
    updatedAt: serverTimestamp(),
    updatedBy: role,
  };

  if (!hasRecord) {
    await runTransaction(db, async (transaction) => {
      const current = await transaction.get(memberRef);
      if (!current.exists()) {
        transaction.set(memberRef, {
          list: 'koi', kick: false, backup: false, removed: false, transferred: false, note: '',
          ...update,
        });
        return;
      }
      const cloudNote = typeof current.data().note === 'string' ? current.data().note : '';
      if (changes.note !== undefined && expectedNote !== null && cloudNote !== expectedNote) {
        throw new TransferError('note-conflict');
      }
      transaction.update(memberRef, update);
    });
    return;
  }

  if (changes.note === undefined) {
    await updateDoc(memberRef, update);
    return;
  }

  // 比對備註本身，不要比對 updatedAt：
  // updatedAt 會被任何一次勾選寫入蓋掉，而且 serverTimestamp() 在送達伺服器前，
  // 本機 snapshot 讀到的是 null，拿它當版本號會誤判成「別人改過」而擋下存檔。
  await runTransaction(db, async (transaction) => {
    const current = await transaction.get(memberRef);
    if (!current.exists()) throw new TransferError('member-not-found');
    const cloudNote = typeof current.data().note === 'string' ? current.data().note : '';
    if (expectedNote !== null && cloudNote !== expectedNote) {
      throw new TransferError('note-conflict');
    }
    transaction.update(memberRef, update);
  });
};

/** 在本季外部轉入名單新增一位玩家 */
export const createExternalMember = async (eventId: string, role: TransferRole, name: string, number: number) => {
  const db = requireDb();
  await setDoc(doc(collection(db, 'transferEvents', eventId, 'members')), {
    list: 'bdk',
    number,
    name,
    kick: false,
    backup: false,
    removed: false,
    transferred: false,
    note: '',
    updatedAt: serverTimestamp(),
    updatedBy: role,
  });
};

/** 從本季外部轉入名單刪除；已建立聯盟主檔關聯者前端不提供刪除 */
export const deleteExternalMember = async (eventId: string, memberId: string) => {
  await deleteDoc(doc(requireDb(), 'transferEvents', eventId, 'members', memberId));
};

/** 外部轉入名單批次新增；序號從 startNumber 起連號，單批最多 500 筆 */
export const createExternalMembers = async (eventId: string, role: TransferRole, names: string[], startNumber: number) => {
  const db = requireDb();
  for (let index = 0; index < names.length; index += 450) {
    const batch = writeBatch(db);
    names.slice(index, index + 450).forEach((name, offset) => {
      batch.set(doc(collection(db, 'transferEvents', eventId, 'members')), {
        list: 'bdk', number: startNumber + index + offset, name,
        kick: false, backup: false, removed: false, transferred: false, note: '',
        updatedAt: serverTimestamp(), updatedBy: role,
      });
    });
    await batch.commit();
  }
};

/** 某賽季目前的外部轉入名單（批次新增時用來略過重複名稱、接續序號） */
export const loadExternalMembers = async (eventId: string) => {
  const db = await connectPublic();
  const snapshot = await getDocs(query(collection(db, 'transferEvents', eventId, 'members'), where('list', '==', 'bdk')));
  return snapshot.docs.map((item) => mapMember(item.id, item.data()));
};

/* ---------------- 賽季管理 ---------------- */

/** 我方名額上限固定，不開放在管理頁修改 */
const SEASON_CAPACITY = 90;

const settingsFields = (settings: SeasonSettings) => ({
  title: settings.title,
  externalName: settings.externalName,
});

export const updateSeasonSettings = async (eventId: string, settings: SeasonSettings) => {
  await updateDoc(doc(requireDb(), 'transferEvents', eventId), {
    ...settingsFields(settings),
    titleEn: settings.titleEn ? settings.titleEn : deleteField(),
    closesAt: settings.closesAt != null ? Timestamp.fromMillis(settings.closesAt) : deleteField(),
  });
};

/** 建立新賽季：只建立賽季本身，既有邀請連結直接適用；以密碼進入管理頁的人也能建立 */
export const createSeason = async (allianceId: string, eventId: string, settings: SeasonSettings) => {
  const { db } = await connectFirebase();
  const eventRef = doc(db, 'transferEvents', eventId);
  // 代碼已被使用時，寫入會變成更新而被 Rules 拒絕；先檢查才能給出明確訊息
  await runTransaction(db, async (transaction) => {
    if ((await transaction.get(eventRef)).exists()) throw new TransferError('season-exists');
    transaction.set(eventRef, {
      ...settingsFields(settings),
      capacity: SEASON_CAPACITY,
      ...(settings.titleEn ? { titleEn: settings.titleEn } : {}),
      ...(settings.closesAt != null ? { closesAt: Timestamp.fromMillis(settings.closesAt) } : {}),
      active: true,
      allianceId,
      createdAt: serverTimestamp(),
    });
  });
};

const seasonEnded = (season: TransferEvent, now: number) =>
  !season.active || (season.closesAt != null && season.closesAt <= now);

/** 同聯盟的所有賽季（公開）：進行中在前、已結束在後，各組內新的在前 */
export const listSeasons = async (allianceId: string): Promise<SeasonSummary[]> => {
  const db = await connectPublic();
  const snapshot = await getDocs(query(collection(db, 'transferEvents'), where('allianceId', '==', allianceId)));
  const now = Date.now();
  return snapshot.docs
    .map((item) => ({ ...mapEvent(item.id, item.data()), createdAt: timestampToMillis(item.data().createdAt) }))
    .sort((left, right) => Number(seasonEnded(left, now)) - Number(seasonEnded(right, now))
      // 腳本建立的賽季 createdAt 是字串，讀不到時改用結束時間排序
      || (right.createdAt ?? right.closesAt ?? 0) - (left.createdAt ?? left.closesAt ?? 0)
      || right.id.localeCompare(left.id));
};

/**
 * 永久刪除賽季：先逐筆刪除賽季紀錄，最後才刪賽季本身。
 * Firestore 刪父文件不會連帶刪子集合；中途失敗可重跑，已刪的不影響。
 * 聯盟主檔不在賽季底下，不受影響。
 */
export const deleteSeason = async (eventId: string) => {
  const db = requireDb();
  const members = await getDocs(collection(db, 'transferEvents', eventId, 'members'));
  const refs = members.docs.map((item) => item.ref);
  for (let index = 0; index < refs.length; index += 450) {
    const batch = writeBatch(db);
    refs.slice(index, index + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  await deleteDoc(doc(db, 'transferEvents', eventId));
};

/* ---------------- 聯盟名單 ---------------- */

const listenAlliance = (
  db: Firestore,
  allianceId: string,
  onAlliance: (alliance: Alliance) => void,
  onMembers: (members: AllianceMember[]) => void,
  onError: (failure: Failure) => void,
) => {
  const stopAlliance = onSnapshot(
    doc(db, 'alliances', allianceId),
    (snapshot) => {
      if (!snapshot.exists()) { onError({ code: 'alliance-not-found' }); return; }
      const data = snapshot.data();
      onAlliance({ id: allianceId, name: typeof data.name === 'string' ? data.name : allianceId });
    },
    (error) => onError(toCode(error)),
  );
  const stopMembers = onSnapshot(
    collection(db, 'alliances', allianceId, 'members'),
    (snapshot) => onMembers(snapshot.docs.map((member) => mapAllianceMember(member.id, member.data()))),
    (error) => onError(toCode(error)),
  );
  return () => { stopAlliance(); stopMembers(); };
};

export const subscribeAlliance = (
  allianceId: string,
  onAlliance: (alliance: Alliance) => void,
  onMembers: (members: AllianceMember[]) => void,
  onError: (failure: Failure) => void,
) => listenPublic((db) => listenAlliance(db, allianceId, onAlliance, onMembers, onError), onError);

const memberFields = (input: MemberInput) => ({
  name: input.name,
  power: input.power,
  rank: input.rank,
});

export const createAllianceMember = async (allianceId: string, input: MemberInput) => {
  const db = requireDb();
  await setDoc(doc(collection(db, 'alliances', allianceId, 'members')), {
    ...memberFields(input),
    version: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

/** 版本不符代表別人剛改過，擋下來讓使用者確認，不靜默覆蓋 */
const assertVersion = (current: { exists(): boolean; data(): DocumentData | undefined }, expectedVersion: number) => {
  if (!current.exists()) throw new TransferError('alliance-member-deleted');
  if (current.data()?.version !== expectedVersion) throw new TransferError('alliance-member-conflict');
};

export const updateAllianceMember = async (
  allianceId: string,
  memberId: string,
  expectedVersion: number,
  input: MemberInput,
) => {
  const db = requireDb();
  const memberRef = doc(db, 'alliances', allianceId, 'members', memberId);
  await runTransaction(db, async (transaction) => {
    assertVersion(await transaction.get(memberRef), expectedVersion);
    transaction.update(memberRef, {
      ...memberFields(input),
      version: expectedVersion + 1,
      updatedAt: serverTimestamp(),
    });
  });
};

export const deleteAllianceMember = async (allianceId: string, memberId: string, expectedVersion: number) => {
  const db = requireDb();
  const memberRef = doc(db, 'alliances', allianceId, 'members', memberId);
  await runTransaction(db, async (transaction) => {
    assertVersion(await transaction.get(memberRef), expectedVersion);
    transaction.delete(memberRef);
  });
};

/** 從賽季已加入的轉入者建立主檔：主檔與賽季關聯同一筆交易寫入，固定 ID 防止重複 */
export const createAllianceMemberFromTransfer = async (
  allianceId: string,
  eventId: string,
  recordId: string,
  role: TransferRole,
  input: MemberInput,
) => {
  const db = requireDb();
  const memberId = linkedMemberId(eventId, recordId);
  const memberRef = doc(db, 'alliances', allianceId, 'members', memberId);
  const recordRef = doc(db, 'transferEvents', eventId, 'members', recordId);
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(memberRef);
    const record = await transaction.get(recordRef);
    if (!record.exists() || record.data().list !== 'bdk') throw new TransferError('member-not-found');
    if (existing.exists() || typeof record.data().allianceMemberId === 'string') {
      throw new TransferError('alliance-member-duplicate');
    }
    transaction.set(memberRef, {
      ...memberFields(input),
      version: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.update(recordRef, {
      allianceMemberId: memberId,
      updatedAt: serverTimestamp(),
      updatedBy: role,
    });
  });
};
