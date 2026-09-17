/**
 * 產生新賽季的本機種子檔。我方成員改由聯盟主檔即時提供，這裡只匯入外部聯盟名單。
 *
 *   npm run prepare:transfer -- "D:/Download/XYZ namelist.xlsx" \
 *     --event-id=koi-xyz-2612 --title="KOi × XYZ 賽季轉移" --external-name=XYZ \
 *     [--title-en="KOi × XYZ Season Transfer"] [--capacity=90] [--alliance-id=koi] [--force]
 *
 * 外部名單 Excel：A 欄序號（數字）、B 欄玩家名稱。
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import readXlsxFile from 'read-excel-file/node';
import { parseFlags, projectRoot } from './lib/firestoreRest.mjs';

const outputPath = path.join(projectRoot, '.transfer-seed.local.json');
const { flags, positional } = parseFlags(process.argv.slice(2));
const force = flags.force === true;

const required = (key) => {
  const value = flags[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`缺少 --${key}=...`);
  return value.trim();
};

if (!positional[0]) throw new Error('請指定外部聯盟名單 Excel 路徑。');
const externalPath = path.resolve(positional[0]);
const eventId = required('event-id');
if (!/^[a-z0-9-]{3,60}$/.test(eventId)) throw new Error('--event-id 只能使用小寫英數與連字號。');
const title = required('title');
const externalName = required('external-name');
const capacity = Number(flags.capacity ?? 90);
if (!Number.isSafeInteger(capacity) || capacity <= 0) throw new Error('--capacity 必須是正整數。');

try {
  await fs.access(outputPath);
  if (!force) {
    throw new Error(`${outputPath} 已存在。為避免更換既有邀請碼，請先備份；確定重建時加上 --force。`);
  }
} catch (error) {
  if (error?.code !== 'ENOENT' && !force) throw error;
}

const rows = await readXlsxFile(externalPath);
const external = rows
  .filter((row) => typeof row[0] === 'number' && typeof row[1] === 'string' && row[1].trim())
  .map((row) => ({
    id: `ext-${String(row[0]).padStart(3, '0')}`,
    // 資料值 'bdk' 代表「外部轉入名單」，沿用舊格式以相容既有賽季
    list: 'bdk',
    number: row[0],
    name: row[1].trim(),
    kick: false,
    backup: false,
    removed: false,
    transferred: false,
    note: '',
    updatedAt: null,
    updatedBy: null,
  }));

if (external.length === 0) throw new Error(`${externalPath} 沒有讀到任何玩家（A 欄序號、B 欄名稱）。`);
const duplicateIds = external.map((member) => member.id).filter((id, index, ids) => ids.indexOf(id) !== index);
if (duplicateIds.length > 0) throw new Error(`序號重複：${[...new Set(duplicateIds)].join('、')}`);

const createToken = () => randomBytes(24).toString('base64url');
const seed = {
  event: {
    id: eventId,
    title,
    ...(typeof flags['title-en'] === 'string' ? { titleEn: flags['title-en'] } : {}),
    capacity,
    active: true,
    allianceId: flags['alliance-id'] ?? 'koi',
    externalName,
  },
  invites: {
    r5: createToken(),
    r4: createToken(),
    adm: createToken(),
  },
  members: external,
};

await fs.writeFile(outputPath, `${JSON.stringify(seed, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });

console.log(`已建立 ${outputPath}`);
console.log(`賽季 ${eventId}：${title}，名額 ${capacity}`);
console.log(`${externalName} ${external.length} 人；我方成員將即時讀取聯盟主檔 ${seed.event.allianceId}`);
console.log('下一步：npm run seed:transfer（加上 --set-maintainer 才會把聯盟維護權限移到這個賽季）');
