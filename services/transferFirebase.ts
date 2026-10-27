import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, signInAnonymously, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  DocumentData,
  Firestore,
  getDoc,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  Alliance,
  AllianceMember,
  SeasonSettings,
  TransferInviteSet,
  TransferMember,
  TransferMemberChanges,
  TransferRole,
  TransferSession,
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

/**
 * 先完成匿名登入並確定拿到 token，才建立 Firestore。
 *
 * 順序很重要：第一次造訪時瀏覽器沒有既有的匿名身分，若先建立 Firestore
 * 再登入，連線會在還沒有憑證的狀態下開啟，名單監聽的第一個 snapshot
 * 就可能一直不回來（畫面卡在「正在驗證邀請連結」）。重新整理之所以會好，
 * 是因為匿名身分已存在 IndexedDB，Firestore 一建立就帶得到 token。
 */
let connecting: Promise<{ db: Firestore; user: User }> | null = null;

const connectFirebase = () => {
  // 同時有多個連線流程（StrictMode 重跑 effect、頁面切換）時共用同一次登入，
  // 否則會各自建立匿名身分，後登入的覆蓋前者，先前流程的讀寫就被 Rules 拒絕
  connecting ??= (async () => {
    const app = ensureApp();
    if (!firebaseAuth) firebaseAuth = getAuth(app);

    await firebaseAuth.authStateReady();
    const user = firebaseAuth.currentUser ?? (await signInAnonymously(firebaseAuth)).user;
    await user.getIdToken();

    if (!firestore) firestore = getFirestore(app);
    return { db: firestore, user };
  })().catch((error) => {
    connecting = null;
    throw error;
  });
  return connecting;
};

/**
 * 公開查看聯盟名單不需要登入，也不替每位訪客建立匿名身分。
 * 仍先等既有登入狀態還原，理由同 connectFirebase：避免 Firestore 在憑證未定時建立。
 */
const connectPublic = async () => {
  const app = ensureApp();
  if (!firebaseAuth) firebaseAuth = getAuth(app);
  await firebaseAuth.authStateReady();
  if (!firestore) firestore = getFirestore(app);
  return firestore;
};

const requireDb = () => {
  if (!firestore) throw new TransferError('not-connected');
  return firestore;
};

const asRole = (value: unknown): TransferRole => {
  if (value === 'r5' || value === 'r4' || value === 'adm') return value;
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
  updatedBy: data.updatedBy ? asRole(data.updatedBy) : null,
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
const toCode = (error: unknown): { code: TransferErrorCode; detail?: string } => {
  if (error instanceof TransferError) return { code: error.code, detail: error.detail };
  const message = error instanceof Error ? error.message : String(error);
  // FirebaseError 的 message 是英文說明，代碼在 code 欄位
  const firebaseCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (firebaseCode === 'permission-denied' || message.includes('permission-denied')) return { code: 'permission-denied' };
  if (firebaseCode === 'unavailable' || message.includes('unavailable')) return { code: 'unavailable' };
  return { code: 'unknown', detail: message };
};

export const joinTransferEvent = async (inviteToken: string): Promise<TransferSession> => {
  const { db, user } = await connectFirebase();

  const inviteSnapshot = await getDoc(doc(db, 'transferInvites', inviteToken));
  if (!inviteSnapshot.exists()) throw new TransferError('invite-not-found');

  const invite = inviteSnapshot.data();
  if (invite.active !== true) throw new TransferError('invite-disabled');
  if (invite.expiresAt instanceof Timestamp && invite.expiresAt.toMillis() <= Date.now()) {
    throw new TransferError('invite-expired');
  }

  const eventId = typeof invite.eventId === 'string' ? invite.eventId : '';
  const role = asRole(invite.role);
  if (!eventId) throw new TransferError('invite-no-event');

  await setDoc(
    doc(db, 'transferEvents', eventId, 'participants', user.uid),
    {
      eventId,
      inviteId: inviteToken,
      role,
      joinedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    },
    { merge: true },
  );

  const eventSnapshot = await getDoc(doc(db, 'transferEvents', eventId));
  if (!eventSnapshot.exists()) throw new TransferError('event-not-found');
  const eventData = eventSnapshot.data();

  return {
    eventId,
    role,
    event: {
      id: eventId,
      title: typeof eventData.title === 'string' ? eventData.title : 'Season Transfer',
      titleEn: typeof eventData.titleEn === 'string' ? eventData.titleEn : undefined,
      capacity: typeof eventData.capacity === 'number' ? eventData.capacity : 90,
      active: eventData.active === true,
      closesAt: typeof eventData.closesAt?.toMillis === 'function' ? eventData.closesAt.toMillis() : undefined,
      allianceId: typeof eventData.allianceId === 'string' ? eventData.allianceId : 'koi',
      externalName: typeof eventData.externalName === 'string' ? eventData.externalName : 'BDK',
    },
  };
};

export const subscribeTransferMembers = (
  eventId: string,
  onMembers: (members: TransferMember[]) => void,
  onError: (failure: { code: TransferErrorCode; detail?: string }) => void,
) => {
  const db = requireDb();
  return onSnapshot(
    collection(db, 'transferEvents', eventId, 'members'),
    (snapshot) => onMembers(
      snapshot.docs
        .map((member) => mapMember(member.id, member.data()))
        .sort((left, right) => left.list.localeCompare(right.list) || left.number - right.number),
    ),
    (error) => onError(toCode(error)),
  );
};

export const updateTransferMember = async (
  eventId: string,
  memberId: string,
  role: TransferRole,
  changes: TransferMemberChanges,
  /** 編輯前這位玩家的備註內容，用來偵測其他幹部是否同時改了備註 */
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

export const loadTransferInvites = async (eventId: string): Promise<TransferInviteSet> => {
  const db = requireDb();
  const snapshot = await getDoc(doc(db, 'transferEvents', eventId, 'admin', 'invites'));
  if (!snapshot.exists()) throw new TransferError('invites-not-found');
  const data = snapshot.data();

  if (typeof data.r5 !== 'string' || typeof data.r4 !== 'string' || typeof data.adm !== 'string') {
    throw new TransferError('invites-incomplete');
  }

  return { r5: data.r5, r4: data.r4, adm: data.adm };
};

export const toTransferError = toCode;

/** 在本季外部轉入名單新增一位玩家（Adm／R5） */
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

/** 從本季外部轉入名單刪除（Adm／R5）；已建立聯盟主檔關聯者由 Rules 擋下 */
export const deleteExternalMember = async (eventId: string, memberId: string) => {
  await deleteDoc(doc(requireDb(), 'transferEvents', eventId, 'members', memberId));
};

/** 外部轉入名單批次新增（Adm／R5）；序號從 startNumber 起連號，單批最多 500 筆 */
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

/* ---------------- 賽季管理（Adm） ---------------- */

/** 邀請碼本身就是權限，用 192 bits 隨機值，與管理腳本相同長度 */
const createInviteToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const settingsFields = (settings: SeasonSettings) => ({
  title: settings.title,
  externalName: settings.externalName,
  capacity: settings.capacity,
});

export const updateSeasonSettings = async (eventId: string, settings: SeasonSettings) => {
  await updateDoc(doc(requireDb(), 'transferEvents', eventId), {
    ...settingsFields(settings),
    titleEn: settings.titleEn ? settings.titleEn : deleteField(),
    closesAt: settings.closesAt != null ? Timestamp.fromMillis(settings.closesAt) : deleteField(),
  });
};

/** 換掉某個身分的連結：新連結生效、舊連結停用（已用舊連結進來的人立即失去權限） */
export const regenerateInvite = async (eventId: string, role: TransferRole, current: TransferInviteSet) => {
  const db = requireDb();
  const token = createInviteToken();
  const next = { ...current, [role]: token };
  const batch = writeBatch(db);
  batch.set(doc(db, 'transferInvites', token), { eventId, role, active: true, createdAt: serverTimestamp() });
  batch.update(doc(db, 'transferInvites', current[role]), { active: false });
  batch.set(doc(db, 'transferEvents', eventId, 'admin', 'invites'), next);
  await batch.commit();
  return next;
};

/** 建立新賽季：賽季、三條邀請、聯盟維護權限移交同一批寫入，任一失敗全部不生效 */
export const createSeason = async (allianceId: string, eventId: string, settings: SeasonSettings) => {
  const db = requireDb();
  const invites: TransferInviteSet = { r5: createInviteToken(), r4: createInviteToken(), adm: createInviteToken() };
  const batch = writeBatch(db);
  batch.set(doc(db, 'transferEvents', eventId), {
    ...settingsFields(settings),
    ...(settings.titleEn ? { titleEn: settings.titleEn } : {}),
    ...(settings.closesAt != null ? { closesAt: Timestamp.fromMillis(settings.closesAt) } : {}),
    active: true,
    allianceId,
    createdAt: serverTimestamp(),
  });
  for (const role of ['r5', 'r4', 'adm'] as TransferRole[]) {
    batch.set(doc(db, 'transferInvites', invites[role]), { eventId, role, active: true, createdAt: serverTimestamp() });
  }
  batch.set(doc(db, 'transferEvents', eventId, 'admin', 'invites'), invites);
  batch.update(doc(db, 'alliances', allianceId), { maintainerEventId: eventId });
  await batch.commit();
  return invites;
};

/* ---------------- 聯盟名單 ---------------- */

export const subscribeAlliance = (
  allianceId: string,
  onAlliance: (alliance: Alliance) => void,
  onMembers: (members: AllianceMember[]) => void,
  onError: (failure: { code: TransferErrorCode; detail?: string }) => void,
) => {
  let disposed = false;
  let stop = () => undefined as void;
  connectPublic()
    .then((db) => {
      if (disposed) return;
      stop = listenAlliance(db, allianceId, onAlliance, onMembers, onError);
    })
    .catch((error) => { if (!disposed) onError(toCode(error)); });
  return () => { disposed = true; stop(); };
};

const listenAlliance = (
  db: Firestore,
  allianceId: string,
  onAlliance: (alliance: Alliance) => void,
  onMembers: (members: AllianceMember[]) => void,
  onError: (failure: { code: TransferErrorCode; detail?: string }) => void,
) => {
  const stopAlliance = onSnapshot(
    doc(db, 'alliances', allianceId),
    (snapshot) => {
      if (!snapshot.exists()) { onError({ code: 'alliance-not-found' }); return; }
      const data = snapshot.data();
      onAlliance({
        id: allianceId,
        name: typeof data.name === 'string' ? data.name : allianceId,
        maintainerEventId: typeof data.maintainerEventId === 'string' ? data.maintainerEventId : null,
      });
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

/** 從本季已加入的轉入者建立主檔：主檔與賽季關聯同一筆交易寫入，固定 ID 防止重複 */
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
