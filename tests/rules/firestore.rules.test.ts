/**
 * Firestore Rules 測試，需要 Firestore Emulator（Java 11+）：
 *   npm run test:rules
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  Firestore,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const createdAt = Timestamp.fromMillis(1_700_000_000_000);
const token = (name: string) => name.padEnd(24, 'x');

const db = (uid?: string) => (uid
  ? env.authenticatedContext(uid).firestore()
  : env.unauthenticatedContext().firestore()) as unknown as Firestore;

const asAdmin = (task: (admin: Firestore) => Promise<unknown>) =>
  env.withSecurityRulesDisabled((context) => task(context.firestore() as unknown as Firestore).then(() => undefined));

const member = (extra: Record<string, unknown> = {}) => ({
  name: 'Ben', power: 100, rank: 'member', version: 1,
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
});

const editorDoc = (role: string, inviteId: string, allianceId = 'koi') => ({
  allianceId, inviteId, role, joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp(),
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-lftime-rules',
    firestore: { rules: fs.readFileSync(path.resolve('firestore.rules'), 'utf8') },
  });
});

afterAll(async () => { await env?.cleanup(); });

/**
 * u-star：呆萌小星、u-snoopy：聰明的史努比（有效邀請）
 * u-off：邀請已停用、u-fake：自稱史努比但拿小星的邀請、u-zzz：其他聯盟的編輯者、u-anon：只有匿名登入
 */
beforeEach(async () => {
  await env.clearFirestore();
  await asAdmin(async (admin) => {
    const put = (p: string, data: Record<string, unknown>) => setDoc(doc(admin, p), data);
    await put('allianceInvites/inv-star', { allianceId: 'koi', role: 'xiaoxing', active: true });
    await put('allianceInvites/inv-snoopy', { allianceId: 'koi', role: 'snoopy', active: true });
    await put('allianceInvites/inv-off', { allianceId: 'koi', role: 'snoopy', active: false });
    await put('allianceInvites/inv-zzz', { allianceId: 'zzz', role: 'xiaoxing', active: true });
    await put('alliances/koi', { name: 'KOi' });
    await put('alliances/zzz', { name: 'ZZZ' });
    await put('alliances/koi/admin/invites', { xiaoxing: 'inv-star', snoopy: 'inv-snoopy' });
    await put('adminKeys/right-pass', { allianceId: 'koi' });
    await put('adminKeys/zzz-pass', { allianceId: 'zzz' });
    await put('alliances/koi/editors/u-star', { allianceId: 'koi', role: 'xiaoxing', inviteId: 'inv-star' });
    await put('alliances/koi/editors/u-snoopy', { allianceId: 'koi', role: 'snoopy', inviteId: 'inv-snoopy' });
    await put('alliances/koi/editors/u-off', { allianceId: 'koi', role: 'snoopy', inviteId: 'inv-off' });
    await put('alliances/koi/editors/u-fake', { allianceId: 'koi', role: 'snoopy', inviteId: 'inv-star' });
    await put('alliances/zzz/editors/u-zzz', { allianceId: 'zzz', role: 'xiaoxing', inviteId: 'inv-zzz' });
    await put('transferEvents/ev', { title: 'S', active: true, allianceId: 'koi', externalName: 'BDK', capacity: 90 });
    await put('transferEvents/ev2', { title: 'S2', active: true, allianceId: 'koi', externalName: 'XYZ', capacity: 90 });
    await put('transferEvents/other', { title: 'Z', active: true, allianceId: 'zzz', externalName: 'Z', capacity: 90 });
    await put('alliances/koi/members/m1', {
      name: 'Ann', power: 10, rank: 'member', version: 1, createdAt, updatedAt: createdAt,
    });
    await put('transferEvents/ev/members/bdk-001', {
      list: 'bdk', number: 1, name: 'Joiner', kick: false, backup: false, removed: false,
      transferred: true, note: '',
    });
    await put('transferEvents/ev/members/m1', {
      list: 'koi', kick: true, backup: false, removed: false, transferred: false, note: 'secret',
    });
  });
});

describe('公開查看', () => {
  it('訪客可讀賽季、賽季名單、聯盟名單與賽季列表', async () => {
    await assertSucceeds(getDoc(doc(db(), 'transferEvents/ev')));
    await assertSucceeds(getDocs(collection(db(), 'transferEvents/ev/members')));
    await assertSucceeds(getDocs(query(collection(db(), 'transferEvents'), where('allianceId', '==', 'koi'))));
    await assertSucceeds(getDoc(doc(db(), 'alliances/koi/members/m1')));
  });

  it('訪客不能寫入任何資料', async () => {
    await assertFails(updateDoc(doc(db(), 'transferEvents/ev/members/m1'), { kick: false }));
    await assertFails(setDoc(doc(db(), 'alliances/koi/members/x'), member()));
    await assertFails(setDoc(doc(db(), 'transferEvents/ev9'), { title: 'S', externalName: 'X', capacity: 90, active: true, allianceId: 'koi', createdAt: serverTimestamp() }));
  });

  it('邀請清單與編輯身分不公開', async () => {
    await assertFails(getDoc(doc(db(), 'alliances/koi/admin/invites')));
    await assertFails(getDoc(doc(db('u-anon'), 'alliances/koi/admin/invites')));
    await assertFails(getDocs(collection(db('u-anon'), 'allianceInvites')));
    await assertFails(getDoc(doc(db('u-anon'), 'alliances/koi/editors/u-star')));
    await assertFails(getDoc(doc(db(), 'allianceInvites/inv-star')));
  });
});

describe('編輯身分', () => {
  it('以有效邀請建立自己的編輯身分', async () => {
    await assertSucceeds(setDoc(doc(db('u-new'), 'alliances/koi/editors/u-new'), editorDoc('xiaoxing', 'inv-star')));
    await assertSucceeds(getDoc(doc(db('u-new'), 'alliances/koi/editors/u-new')));
  });

  it('停用邀請、角色不符、其他聯盟的邀請、替別人建立都拒絕', async () => {
    await assertFails(setDoc(doc(db('u-new'), 'alliances/koi/editors/u-new'), editorDoc('snoopy', 'inv-off')));
    await assertFails(setDoc(doc(db('u-new'), 'alliances/koi/editors/u-new'), editorDoc('snoopy', 'inv-star')));
    await assertFails(setDoc(doc(db('u-new'), 'alliances/koi/editors/u-new'), editorDoc('xiaoxing', 'inv-zzz')));
    await assertFails(setDoc(doc(db('u-new'), 'alliances/koi/editors/u-other'), editorDoc('xiaoxing', 'inv-star')));
    await assertFails(setDoc(doc(db('u-new'), 'alliances/koi/editors/u-new'), { ...editorDoc('xiaoxing', 'inv-star'), extra: 1 }));
  });

  it('匿名登入者可精確讀取邀請（驗證用），不能列出', async () => {
    await assertSucceeds(getDoc(doc(db('u-anon'), 'allianceInvites/inv-star')));
    await assertFails(getDocs(collection(db('u-anon'), 'allianceInvites')));
  });
});

describe('聯盟主檔', () => {
  it('兩個身分都可新增；停用邀請、偽造角色、其他聯盟、匿名不行', async () => {
    await assertSucceeds(setDoc(doc(db('u-star'), 'alliances/koi/members/a'), member()));
    await assertSucceeds(setDoc(doc(db('u-snoopy'), 'alliances/koi/members/b'), member()));
    await assertFails(setDoc(doc(db('u-off'), 'alliances/koi/members/c'), member()));
    await assertFails(setDoc(doc(db('u-fake'), 'alliances/koi/members/d'), member()));
    await assertFails(setDoc(doc(db('u-zzz'), 'alliances/koi/members/e'), member()));
    await assertFails(setDoc(doc(db('u-anon'), 'alliances/koi/members/f'), member()));
  });

  it('聯盟文件本身不能改', async () => {
    await assertFails(updateDoc(doc(db('u-star'), 'alliances/koi'), { name: 'X' }));
  });

  it.each([
    ['空名稱', { name: '' }],
    ['前後空白', { name: ' Ben ' }],
    ['名稱過長', { name: 'x'.repeat(101) }],
    ['負戰力', { power: -1 }],
    ['小數戰力', { power: 1.5 }],
    ['字串戰力', { power: '100' }],
    ['不合法階級', { rank: 'r3' }],
    ['多餘欄位', { note: 'secret' }],
    ['版本不是 1', { version: 2 }],
  ])('拒絕非法新增：%s', async (_, extra) => {
    await assertFails(setDoc(doc(db('u-star'), 'alliances/koi/members/bad'), member(extra)));
  });

  it('戰力可留空', async () => {
    await assertSucceeds(setDoc(doc(db('u-star'), 'alliances/koi/members/a'), member({ power: null })));
  });

  it('更新必須版本 +1 且不能改 createdAt', async () => {
    const ref = doc(db('u-star'), 'alliances/koi/members/m1');
    await assertFails(updateDoc(ref, { name: 'Ann2', version: 1, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { name: 'Ann2', version: 3, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { version: 2, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref, { name: 'Ann2', rank: 'r4', version: 2, updatedAt: serverTimestamp() }));
  });

  it('刪除限編輯者', async () => {
    await assertFails(deleteDoc(doc(db('u-off'), 'alliances/koi/members/m1')));
    await assertSucceeds(deleteDoc(doc(db('u-snoopy'), 'alliances/koi/members/m1')));
  });
});

describe('賽季紀錄', () => {
  const state = (extra: Record<string, unknown> = {}) => ({
    list: 'koi', kick: true, backup: false, removed: false, transferred: false, note: '',
    updatedAt: serverTimestamp(), ...extra,
  });

  it('編輯者可為聯盟成員建立賽季紀錄、勾選與寫備註（所有賽季都適用）', async () => {
    await assertSucceeds(setDoc(doc(db('u-star'), 'transferEvents/ev2/members/m1'), state({ updatedBy: 'xiaoxing' })));
    await assertSucceeds(updateDoc(doc(db('u-snoopy'), 'transferEvents/ev/members/m1'), {
      kick: false, backup: true, note: 'n', updatedAt: serverTimestamp(), updatedBy: 'snoopy',
    }));
  });

  it('主檔不存在、夾帶主檔欄位、身分不符、非編輯者時拒絕', async () => {
    await assertFails(setDoc(doc(db('u-star'), 'transferEvents/ev2/members/ghost'), state({ updatedBy: 'xiaoxing' })));
    await assertFails(setDoc(doc(db('u-star'), 'transferEvents/ev2/members/m1'), state({ updatedBy: 'xiaoxing', name: 'X' })));
    await assertFails(setDoc(doc(db('u-star'), 'transferEvents/ev2/members/m1'), state({ updatedBy: 'snoopy' })));
    await assertFails(setDoc(doc(db('u-off'), 'transferEvents/ev2/members/m1'), state({ updatedBy: 'snoopy' })));
    await assertFails(setDoc(doc(db('u-zzz'), 'transferEvents/ev2/members/m1'), state({ updatedBy: 'xiaoxing' })));
  });

  it('轉入者建立主檔：主檔與關聯需同批寫入，只能一次', async () => {
    const link = (uid: string, role: string) => {
      const firestore = db(uid);
      const batch = writeBatch(firestore);
      batch.set(doc(firestore, 'alliances/koi/members/ev--bdk-001'), member());
      batch.update(doc(firestore, 'transferEvents/ev/members/bdk-001'), {
        allianceMemberId: 'ev--bdk-001', updatedAt: serverTimestamp(), updatedBy: role,
      });
      return batch.commit();
    };
    await assertFails(link('u-off', 'snoopy'));
    await assertFails(updateDoc(doc(db('u-star'), 'transferEvents/ev/members/bdk-001'), {
      allianceMemberId: 'ev--bdk-001', updatedAt: serverTimestamp(), updatedBy: 'xiaoxing',
    }));
    await assertSucceeds(link('u-star', 'xiaoxing'));
    await assertFails(link('u-snoopy', 'snoopy'));
  });

  it('關聯 ID 必須是固定對應', async () => {
    const firestore = db('u-star');
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, 'alliances/koi/members/other'), member());
    batch.update(doc(firestore, 'transferEvents/ev/members/bdk-001'), {
      allianceMemberId: 'other', updatedAt: serverTimestamp(), updatedBy: 'xiaoxing',
    });
    await assertFails(batch.commit());
  });
});

describe('外部轉入名單新增、刪除', () => {
  const external = (role: string, extra: Record<string, unknown> = {}) => ({
    list: 'bdk', number: 32, name: 'Smoothier', kick: false, backup: false, removed: false,
    transferred: false, note: '', updatedAt: serverTimestamp(), updatedBy: role, ...extra,
  });

  it('兩個身分都可新增；停用邀請不行', async () => {
    await assertSucceeds(setDoc(doc(db('u-star'), 'transferEvents/ev/members/x1'), external('xiaoxing')));
    await assertSucceeds(setDoc(doc(db('u-snoopy'), 'transferEvents/ev/members/x2'), external('snoopy')));
    await assertFails(setDoc(doc(db('u-off'), 'transferEvents/ev/members/x3'), external('snoopy')));
  });

  it.each([
    ['空名稱', { name: '' }],
    ['前後空白', { name: ' A ' }],
    ['序號非整數', { number: '3' }],
    ['預先勾踢除', { kick: true }],
    ['夾帶關聯', { allianceMemberId: 'ev--x' }],
    ['我方名單', { list: 'koi' }],
  ])('拒絕非法新增：%s', async (_, extra) => {
    await assertFails(setDoc(doc(db('u-star'), 'transferEvents/ev/members/bad'), external('xiaoxing', extra)));
  });

  it('刪除限編輯者', async () => {
    await assertFails(deleteDoc(doc(db('u-off'), 'transferEvents/ev/members/bdk-001')));
    await assertFails(deleteDoc(doc(db('u-anon'), 'transferEvents/ev/members/bdk-001')));
    await assertSucceeds(deleteDoc(doc(db('u-star'), 'transferEvents/ev/members/bdk-001')));
  });
});

describe('賽季結束時間', () => {
  const close = (at: Date) => asAdmin((admin) => updateDoc(doc(admin, 'transferEvents/ev'), { closesAt: at }));
  const tick = { transferred: false, updatedAt: serverTimestamp(), updatedBy: 'xiaoxing' };

  it('結束時間未到仍可編輯', async () => {
    await close(new Date(Date.now() + 3_600_000));
    await assertSucceeds(updateDoc(doc(db('u-star'), 'transferEvents/ev/members/bdk-001'), tick));
  });

  it('超過結束時間：可讀取，不能勾選或新增', async () => {
    await close(new Date(Date.now() - 60_000));
    await assertSucceeds(getDoc(doc(db(), 'transferEvents/ev/members/bdk-001')));
    await assertFails(updateDoc(doc(db('u-star'), 'transferEvents/ev/members/bdk-001'), tick));
    await assertFails(setDoc(doc(db('u-star'), 'transferEvents/ev/members/x9'), {
      list: 'bdk', number: 9, name: 'Late', kick: false, backup: false, removed: false,
      transferred: false, note: '', updatedAt: serverTimestamp(), updatedBy: 'xiaoxing',
    }));
  });
});

const unlock = (uid: string, key: string, allianceId = 'koi') =>
  setDoc(doc(db(uid), `alliances/${allianceId}/unlocked/${uid}`), { key, unlockedAt: serverTimestamp() });

describe('管理密碼', () => {
  it('密碼正確才能解鎖；錯誤密碼、其他聯盟的密碼、替別人解鎖、訪客都拒絕', async () => {
    await assertFails(unlock('u-anon', 'wrong'));
    await assertFails(unlock('u-anon', 'zzz-pass'));
    await assertFails(setDoc(doc(db('u-anon'), 'alliances/koi/unlocked/u-other'), { key: 'right-pass', unlockedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db(), 'alliances/koi/unlocked/u-anon'), { key: 'right-pass', unlockedAt: serverTimestamp() }));
    await assertSucceeds(unlock('u-anon', 'right-pass'));
  });

  it('密碼文件不能讀取或列出', async () => {
    await assertFails(getDoc(doc(db('u-anon'), 'adminKeys/right-pass')));
    await assertFails(getDocs(collection(db('u-star'), 'adminKeys')));
  });

  it('解鎖後可查看邀請連結，但不能換新、不能編輯名單', async () => {
    await assertFails(getDoc(doc(db('u-anon'), 'alliances/koi/admin/invites')));
    await unlock('u-anon', 'right-pass');
    await assertSucceeds(getDoc(doc(db('u-anon'), 'alliances/koi/admin/invites')));
    await assertFails(updateDoc(doc(db('u-anon'), 'allianceInvites/inv-star'), { active: false }));
    await assertFails(updateDoc(doc(db('u-anon'), 'transferEvents/ev/members/m1'), { kick: false, updatedAt: serverTimestamp(), updatedBy: 'xiaoxing' }));
  });

  it('換密碼後舊解鎖立即失效', async () => {
    await unlock('u-anon', 'right-pass');
    await asAdmin((admin) => deleteDoc(doc(admin, 'adminKeys/right-pass')));
    await assertFails(getDoc(doc(db('u-anon'), 'alliances/koi/admin/invites')));
  });
});

describe('賽季管理', () => {
  const season = (extra: Record<string, unknown> = {}) => ({
    title: 'S', externalName: 'BDK', capacity: 90, active: true, allianceId: 'koi', createdAt: serverTimestamp(), ...extra,
  });

  it('密碼解鎖者與編輯者可建立新賽季；未解鎖、非法值、已存在、不存在的聯盟不行', async () => {
    await assertFails(setDoc(doc(db('u-anon'), 'transferEvents/ev3'), season()));
    await assertFails(setDoc(doc(db(), 'transferEvents/ev4'), season()));
    await assertSucceeds(setDoc(doc(db('u-snoopy'), 'transferEvents/ev9'), season()));
    await unlock('u-anon', 'right-pass');
    await assertSucceeds(setDoc(doc(db('u-anon'), 'transferEvents/ev3'), season()));
    await assertFails(setDoc(doc(db('u-anon'), 'transferEvents/ev2'), season()));
    await assertFails(setDoc(doc(db('u-anon'), 'transferEvents/ev5'), season({ active: false })));
    await assertFails(setDoc(doc(db('u-anon'), 'transferEvents/ev6'), season({ allianceId: 'nope' })));
    await assertFails(setDoc(doc(db('u-anon'), 'transferEvents/ev7'), season({ capacity: 0 })));
    await assertFails(setDoc(doc(db('u-anon'), 'transferEvents/ev8'), season({ extra: 1 })));
  });

  it('編輯者可改賽季設定；匿名、其他聯盟、非法值、改 allianceId 不行', async () => {
    await assertSucceeds(updateDoc(doc(db('u-snoopy'), 'transferEvents/ev'), { externalName: 'XYZ', closesAt: new Date(Date.now() + 60_000) }));
    await assertFails(updateDoc(doc(db('u-anon'), 'transferEvents/ev'), { externalName: 'A' }));
    await assertFails(updateDoc(doc(db('u-zzz'), 'transferEvents/ev'), { externalName: 'Z' }));
    await assertFails(updateDoc(doc(db('u-star'), 'transferEvents/ev'), { capacity: 80 }));
    await assertFails(updateDoc(doc(db('u-star'), 'transferEvents/ev'), { externalName: '' }));
    await assertFails(updateDoc(doc(db('u-star'), 'transferEvents/ev'), { allianceId: 'zzz' }));
    await assertFails(updateDoc(doc(db('u-star'), 'transferEvents/ev'), { active: false }));
  });

  it('賽季已結束時仍可延長結束時間', async () => {
    await asAdmin((admin) => updateDoc(doc(admin, 'transferEvents/ev'), { closesAt: new Date(Date.now() - 60_000) }));
    await assertSucceeds(updateDoc(doc(db('u-star'), 'transferEvents/ev'), { closesAt: new Date(Date.now() + 3_600_000) }));
  });

  it('編輯者可刪除任何本聯盟賽季（含名單）；匿名、其他聯盟不行', async () => {
    await assertFails(deleteDoc(doc(db('u-anon'), 'transferEvents/ev2')));
    await assertFails(deleteDoc(doc(db('u-zzz'), 'transferEvents/ev')));
    await assertFails(deleteDoc(doc(db('u-star'), 'transferEvents/other')));
    const firestore = db('u-star');
    const batch = writeBatch(firestore);
    batch.delete(doc(firestore, 'transferEvents/ev/members/bdk-001'));
    batch.delete(doc(firestore, 'transferEvents/ev/members/m1'));
    batch.delete(doc(firestore, 'transferEvents/ev'));
    await assertSucceeds(batch.commit());
  });
});

describe('編輯邀請連結', () => {
  it('編輯者可讀取兩條連結；停用邀請者不行', async () => {
    await assertSucceeds(getDoc(doc(db('u-snoopy'), 'alliances/koi/admin/invites')));
    await assertFails(getDoc(doc(db('u-off'), 'alliances/koi/admin/invites')));
  });

  it('編輯者可換新連結：新增新邀請、停用舊邀請、更新清單', async () => {
    const firestore = db('u-star');
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, `allianceInvites/${token('new-snoopy')}`), { allianceId: 'koi', role: 'snoopy', active: true, createdAt: serverTimestamp() });
    batch.update(doc(firestore, 'allianceInvites/inv-snoopy'), { active: false });
    batch.set(doc(firestore, 'alliances/koi/admin/invites'), { xiaoxing: 'inv-star', snoopy: token('new-snoopy') });
    await assertSucceeds(batch.commit());
    // 舊邀請停用後，用它進來的身分立即失效
    await assertFails(setDoc(doc(db('u-snoopy'), 'alliances/koi/members/z'), member()));
  });

  it('換掉自己的連結後，可用新連結重新建立身分', async () => {
    await asAdmin(async (admin) => {
      await setDoc(doc(admin, `allianceInvites/${token('new-star')}`), { allianceId: 'koi', role: 'xiaoxing', active: true });
      await updateDoc(doc(admin, 'allianceInvites/inv-star'), { active: false });
    });
    await assertFails(setDoc(doc(db('u-star'), 'alliances/koi/members/y'), member()));
    await assertSucceeds(setDoc(doc(db('u-star'), 'alliances/koi/editors/u-star'), editorDoc('xiaoxing', token('new-star'))));
    await assertSucceeds(setDoc(doc(db('u-star'), 'alliances/koi/members/y'), member()));
  });

  it('非編輯者不能產生、停用邀請；不能改指向其他聯盟；清單不能指向其他聯盟的邀請', async () => {
    await assertFails(setDoc(doc(db('u-anon'), `allianceInvites/${token('anon')}`), { allianceId: 'koi', role: 'xiaoxing', active: true, createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db('u-anon'), 'allianceInvites/inv-star'), { active: false }));
    await assertFails(updateDoc(doc(db('u-star'), 'allianceInvites/inv-snoopy'), { allianceId: 'zzz' }));
    await assertFails(setDoc(doc(db('u-star'), `allianceInvites/${token('for-zzz')}`), { allianceId: 'zzz', role: 'xiaoxing', active: true, createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db('u-star'), 'allianceInvites/short'), { allianceId: 'koi', role: 'xiaoxing', active: true, createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db('u-star'), `allianceInvites/${token('bad-role')}`), { allianceId: 'koi', role: 'adm', active: true, createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db('u-star'), 'alliances/koi/admin/invites'), { xiaoxing: 'inv-zzz', snoopy: 'inv-snoopy' }));
  });
});
