/**
 * 設定賽季結束時間：時間一到，名單自動變唯讀（仍可查看）。
 *
 *   npm run close:transfer -- --event-id=koi-bdk-2609 --at="2026-09-20T22:00+08:00"
 *   npm run close:transfer -- --event-id=koi-bdk-2609 --at=now   # 立即結束
 */
import { createClient, parseFlags } from './lib/firestoreRest.mjs';

const { flags } = parseFlags(process.argv.slice(2));
const eventId = flags['event-id'];
if (typeof eventId !== 'string' || !eventId) throw new Error('缺少 --event-id=...');
if (typeof flags.at !== 'string') throw new Error('缺少 --at=...，例如 --at="2026-09-20T22:00+08:00" 或 --at=now');
const closesAt = flags.at === 'now' ? new Date() : new Date(flags.at);
if (Number.isNaN(closesAt.getTime())) throw new Error('--at 格式錯誤，例如 2026-09-20T22:00+08:00');

const client = await createClient();
if (!(await client.getDocument(`transferEvents/${eventId}`))) throw new Error(`找不到賽季 ${eventId}`);
await client.commit([client.patchWrite(`transferEvents/${eventId}`, { closesAt })]);

console.log(`賽季 ${eventId} 結束時間設為 ${closesAt.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}（台灣時間）`);
