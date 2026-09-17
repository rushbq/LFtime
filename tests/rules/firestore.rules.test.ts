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
  deleteDoc,
  doc,
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

const db = (uid?: string) => (uid
  ? env.authenticatedContext(uid).firestore()
  : env.unauthenticatedContext().firestore()) as unknown as Firestore;

const member = (extra: Record<string, unknown> = {}) => ({
  name: 'Ben', power: 100, rank: 'member', version: 1,
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-lftime-rules',
    firestore: { rules: fs.readFileSync(path.resolve('firestore.rules'), 'utf8') },
  });
});

afterAll(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const admin = context.firestore() as unknown as Firestore;
    const put = (p: string, data: Record<string, unknown>) => setDoc(doc(admin, p), data);
    await put('transferInvites/inv-r5', { eventId: 'ev', role: 'r5', active: true });
    await put('transferInvites/inv-r4', { eventId: 'ev', role: 'r4', active: true });
    await put('transferInvites/inv-adm', { eventId: 'ev', role: 'adm', active: true });
    await put('transferInvites/inv-off', { eventId: 'ev', role: 'r5', active: false });
    await put('transferInvites/inv-ev2', { eventId: 'ev2', role: 'r5', active: true });
    await put('transferEvents/ev', { active: true, allianceId: 'koi', externalName: 'BDK', capacity: 90 });
    await put('transferEvents/ev2', { active: true, allianceId: 'koi', externalName: 'XYZ', capacity: 90 });
    await put('transferEvents/ev/participants/u-r5', { eventId: 'ev', role: 'r5', inviteId: 'inv-r5' });
    await put('transferEvents/ev/participants/u-r4', { eventId: 'ev', role: 'r4', inviteId: 'inv-r4' });
    await put('transferEvents/ev/participants/u-adm', { eventId: 'ev', role: 'adm', inviteId: 'inv-adm' });
    await put('transferEvents/ev/participants/u-off', { eventId: 'ev', role: 'r5', inviteId: 'inv-off' });
    await put('transferEvents/ev/participants/u-fake', { eventId: 'ev', role: 'adm', inviteId: 'inv-r4' });
    await put('transferEvents/ev2/participants/u-ev2', { eventId: 'ev2', role: 'r5', inviteId: 'inv-ev2' });
    await put('alliances/koi', { name: 'KOi', maintainerEventId: 'ev' });
    await put('alliances/koi/members/m1', {
      name: 'Ann', power: 10, rank: 'member', version: 1, createdAt, updatedAt: createdAt,
    });
    await put('transferEvents/ev/members/bdk-001', {
      list: 'bdk', number: 1, name: 'Joiner', kick: false, backup: false, removed: false,
      transferred: true, note: '',
    });
  });
});

describe('聯盟主檔', () => {
  it('訪客可公開讀取，不能寫入', async () => {
    await assertSucceeds(getDoc(doc(db(), 'alliances/koi/members/m1')));
    await assertSucceeds(getDoc(doc(db(), 'alliances/koi')));
    await assertFails(setDoc(doc(db(), 'alliances/koi/members/x'), member()));
    await assertFails(setDoc(doc(db('u-r5'), 'alliances/koi'), { name: 'KOi', maintainerEventId: 'ev2' }));
  });

  it('Adm、R5 可新增；R4、失效邀請、偽造角色、其他賽季不行', async () => {
    await assertSucceeds(setDoc(doc(db('u-r5'), 'alliances/koi/members/a'), member()));
    await assertSucceeds(setDoc(doc(db('u-adm'), 'alliances/koi/members/b'), member()));
    await assertFails(setDoc(doc(db('u-r4'), 'alliances/koi/members/c'), member()));
    await assertFails(setDoc(doc(db('u-off'), 'alliances/koi/members/d'), member()));
    await assertFails(setDoc(doc(db('u-fake'), 'alliances/koi/members/e'), member()));
    await assertFails(setDoc(doc(db('u-ev2'), 'alliances/koi/members/f'), member()));
  });

  it('賽季關閉後停止維護權限，公開查看不受影響', async () => {
    await env.withSecurityRulesDisabled((context) =>
      updateDoc(doc(context.firestore() as unknown as Firestore, 'transferEvents/ev'), { active: false }));
    await assertFails(setDoc(doc(db('u-r5'), 'alliances/koi/members/a'), member()));
    await assertSucceeds(getDoc(doc(db(), 'alliances/koi/members/m1')));
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
    await assertFails(setDoc(doc(db('u-r5'), 'alliances/koi/members/bad'), member(extra)));
  });

  it('戰力可留空', async () => {
    await assertSucceeds(setDoc(doc(db('u-r5'), 'alliances/koi/members/a'), member({ power: null })));
  });

  it('更新必須版本 +1 且不能改 createdAt', async () => {
    const ref = doc(db('u-r5'), 'alliances/koi/members/m1');
    await assertFails(updateDoc(ref, { name: 'Ann2', version: 1, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { name: 'Ann2', version: 3, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { version: 2, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db('u-r4'), 'alliances/koi/members/m1'), { name: 'Ann2', version: 2, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref, { name: 'Ann2', rank: 'r4', version: 2, updatedAt: serverTimestamp() }));
  });

  it('刪除僅限 Adm、R5', async () => {
    await assertFails(deleteDoc(doc(db('u-r4'), 'alliances/koi/members/m1')));
    await assertSucceeds(deleteDoc(doc(db('u-adm'), 'alliances/koi/members/m1')));
  });
});

describe('賽季紀錄', () => {
  const state = (extra: Record<string, unknown> = {}) => ({
    list: 'koi', kick: true, backup: false, removed: false, transferred: false, note: '',
    updatedAt: serverTimestamp(), ...extra,
  });

  it('R4 可為存在的聯盟成員建立賽季紀錄', async () => {
    await assertSucceeds(setDoc(doc(db('u-r4'), 'transferEvents/ev/members/m1'), state({ updatedBy: 'r4' })));
  });

  it('主檔不存在、夾帶主檔欄位、角色不符時拒絕', async () => {
    await assertFails(setDoc(doc(db('u-r4'), 'transferEvents/ev/members/ghost'), state({ updatedBy: 'r4' })));
    await assertFails(setDoc(doc(db('u-r4'), 'transferEvents/ev/members/m1'), state({ updatedBy: 'r4', name: 'X' })));
    await assertFails(setDoc(doc(db('u-r4'), 'transferEvents/ev/members/m1'), state({ updatedBy: 'r5' })));
    await assertFails(setDoc(doc(db('u-r4'), 'transferEvents/ev/members/m1'), state({ updatedBy: 'r4', list: 'bdk' })));
  });

  it('轉入者建立主檔：主檔與關聯需同批寫入，只能一次，R4 不行', async () => {
    const link = (uid: string, role: string) => {
      const firestore = db(uid);
      const batch = writeBatch(firestore);
      batch.set(doc(firestore, 'alliances/koi/members/ev--bdk-001'), member());
      batch.update(doc(firestore, 'transferEvents/ev/members/bdk-001'), {
        allianceMemberId: 'ev--bdk-001', updatedAt: serverTimestamp(), updatedBy: role,
      });
      return batch.commit();
    };
    await assertFails(link('u-r4', 'r4'));
    await assertFails(updateDoc(doc(db('u-r5'), 'transferEvents/ev/members/bdk-001'), {
      allianceMemberId: 'ev--bdk-001', updatedAt: serverTimestamp(), updatedBy: 'r5',
    }));
    await assertSucceeds(link('u-r5', 'r5'));
    await assertFails(link('u-adm', 'adm'));
  });

  it('關聯 ID 必須是固定對應', async () => {
    const firestore = db('u-r5');
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, 'alliances/koi/members/other'), member());
    batch.update(doc(firestore, 'transferEvents/ev/members/bdk-001'), {
      allianceMemberId: 'other', updatedAt: serverTimestamp(), updatedBy: 'r5',
    });
    await assertFails(batch.commit());
  });
});

describe('外部轉入名單新增、刪除', () => {
  const external = (role: string, extra: Record<string, unknown> = {}) => ({
    list: 'bdk', number: 32, name: 'Smoothier', kick: false, backup: false, removed: false,
    transferred: false, note: '', updatedAt: serverTimestamp(), updatedBy: role, ...extra,
  });

  it('Adm、R5 可新增；R4 不行', async () => {
    await assertSucceeds(setDoc(doc(db('u-r5'), 'transferEvents/ev/members/x1'), external('r5')));
    await assertSucceeds(setDoc(doc(db('u-adm'), 'transferEvents/ev/members/x2'), external('adm')));
    await assertFails(setDoc(doc(db('u-r4'), 'transferEvents/ev/members/x3'), external('r4')));
  });

  it.each([
    ['空名稱', { name: '' }],
    ['前後空白', { name: ' A ' }],
    ['序號非整數', { number: '3' }],
    ['預先勾踢除', { kick: true }],
    ['夾帶關聯', { allianceMemberId: 'ev--x' }],
    ['我方名單', { list: 'koi' }],
  ])('拒絕非法新增：%s', async (_, extra) => {
    await assertFails(setDoc(doc(db('u-r5'), 'transferEvents/ev/members/bad'), external('r5', extra)));
  });

  it('刪除限 Adm、R5，且不能刪已建立聯盟關聯者或我方紀錄', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const admin = context.firestore() as unknown as Firestore;
      await setDoc(doc(admin, 'transferEvents/ev/members/linked'), { list: 'bdk', number: 2, name: 'L', allianceMemberId: 'ev--linked' });
      await setDoc(doc(admin, 'transferEvents/ev/members/m1'), { list: 'koi', kick: true });
    });
    await assertFails(deleteDoc(doc(db('u-r4'), 'transferEvents/ev/members/bdk-001')));
    await assertFails(deleteDoc(doc(db('u-r5'), 'transferEvents/ev/members/linked')));
    await assertFails(deleteDoc(doc(db('u-r5'), 'transferEvents/ev/members/m1')));
    await assertSucceeds(deleteDoc(doc(db('u-r5'), 'transferEvents/ev/members/bdk-001')));
  });
});
