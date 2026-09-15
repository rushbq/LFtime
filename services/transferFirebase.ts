import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, signInAnonymously } from 'firebase/auth';
import {
  collection,
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
} from 'firebase/firestore';
import {
  TransferInviteSet,
  TransferMember,
  TransferMemberChanges,
  TransferRole,
  TransferSession,
} from '../features/transfer/types';

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
    throw new Error(`雲端尚未設定完成：${missingConfig.join('、')}`);
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
const connectFirebase = async () => {
  const app = ensureApp();
  if (!firebaseAuth) firebaseAuth = getAuth(app);

  await firebaseAuth.authStateReady();
  const user = firebaseAuth.currentUser ?? (await signInAnonymously(firebaseAuth)).user;
  await user.getIdToken();

  if (!firestore) firestore = getFirestore(app);
  return { db: firestore, user };
};

const requireDb = () => {
  if (!firestore) throw new Error('尚未連線到雲端，請重新整理頁面');
  return firestore;
};

const asRole = (value: unknown): TransferRole => {
  if (value === 'r5' || value === 'r4' || value === 'adm') return value;
  throw new Error('這組邀請連結沒有有效身分');
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
});

const readableFirebaseError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('permission-denied')) return '這組邀請連結已失效或沒有操作權限';
  if (message.includes('unavailable')) return '目前無法連線到雲端，請檢查網路後重試';
  return message;
};

export const joinTransferEvent = async (inviteToken: string): Promise<TransferSession> => {
  const { db, user } = await connectFirebase();

  const inviteSnapshot = await getDoc(doc(db, 'transferInvites', inviteToken));
  if (!inviteSnapshot.exists()) throw new Error('找不到這組邀請連結');

  const invite = inviteSnapshot.data();
  if (invite.active !== true) throw new Error('這組邀請連結已停用');
  if (invite.expiresAt instanceof Timestamp && invite.expiresAt.toMillis() <= Date.now()) {
    throw new Error('這組邀請連結已過期');
  }

  const eventId = typeof invite.eventId === 'string' ? invite.eventId : '';
  const role = asRole(invite.role);
  if (!eventId) throw new Error('邀請連結缺少活動資料');

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
  if (!eventSnapshot.exists()) throw new Error('找不到這次轉移活動');
  const eventData = eventSnapshot.data();

  return {
    eventId,
    role,
    event: {
      id: eventId,
      title: typeof eventData.title === 'string' ? eventData.title : '賽季轉移確認',
      capacity: typeof eventData.capacity === 'number' ? eventData.capacity : 90,
      active: eventData.active === true,
    },
  };
};

export const subscribeTransferMembers = (
  eventId: string,
  onMembers: (members: TransferMember[]) => void,
  onError: (message: string) => void,
) => {
  const db = requireDb();
  return onSnapshot(
    collection(db, 'transferEvents', eventId, 'members'),
    (snapshot) => onMembers(
      snapshot.docs
        .map((member) => mapMember(member.id, member.data()))
        .sort((left, right) => left.list.localeCompare(right.list) || left.number - right.number),
    ),
    (error) => onError(readableFirebaseError(error)),
  );
};

export const updateTransferMember = async (
  eventId: string,
  memberId: string,
  role: TransferRole,
  changes: TransferMemberChanges,
  expectedUpdatedAt: number | null,
) => {
  const db = requireDb();
  const memberRef = doc(db, 'transferEvents', eventId, 'members', memberId);
  const update = {
    ...changes,
    updatedAt: serverTimestamp(),
    updatedBy: role,
  };

  if (changes.note === undefined) {
    await updateDoc(memberRef, update);
    return;
  }

  await runTransaction(db, async (transaction) => {
    const current = await transaction.get(memberRef);
    if (!current.exists()) throw new Error('找不到這位玩家');
    const cloudUpdatedAt = timestampToMillis(current.data().updatedAt);
    if (cloudUpdatedAt !== expectedUpdatedAt) {
      throw new Error('這筆資料剛被其他幹部更新，已重新載入最新內容');
    }
    transaction.update(memberRef, update);
  });
};

export const loadTransferInvites = async (eventId: string): Promise<TransferInviteSet> => {
  const db = requireDb();
  const snapshot = await getDoc(doc(db, 'transferEvents', eventId, 'admin', 'invites'));
  if (!snapshot.exists()) throw new Error('找不到邀請連結設定');
  const data = snapshot.data();

  if (typeof data.r5 !== 'string' || typeof data.r4 !== 'string' || typeof data.adm !== 'string') {
    throw new Error('邀請連結設定不完整');
  }

  return { r5: data.r5, r4: data.r4, adm: data.adm };
};

export const toTransferError = readableFirebaseError;
