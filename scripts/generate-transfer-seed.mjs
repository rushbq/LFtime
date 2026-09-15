import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import readXlsxFile from 'read-excel-file/node';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outputPath = path.join(projectRoot, '.transfer-seed.local.json');
const force = process.argv.includes('--force');

const argumentsWithoutFlags = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
const koiPath = path.resolve(argumentsWithoutFlags[0] ?? 'D:/Download/KOi名單-2609.xlsx');
const bdkPath = path.resolve(argumentsWithoutFlags[1] ?? 'D:/Download/BDK namelist.xlsx');

try {
  await fs.access(outputPath);
  if (!force) {
    throw new Error(`${outputPath} 已存在。為避免更換既有邀請碼，請先備份；確定重建時加上 --force。`);
  }
} catch (error) {
  if (error?.code !== 'ENOENT' && !force) throw error;
}

const [koiRows, bdkRows] = await Promise.all([readXlsxFile(koiPath), readXlsxFile(bdkPath)]);
const hasMark = (value) => value !== null && String(value).trim() !== '';

const koi = koiRows.slice(1)
  .filter((row) => typeof row[0] === 'number' && typeof row[1] === 'string')
  .map((row) => ({
    id: `koi-${String(row[0]).padStart(3, '0')}`,
    list: 'koi',
    number: row[0],
    name: row[1],
    ...(typeof row[2] === 'number' ? { power: row[2] } : {}),
    ...(typeof row[3] === 'string' ? { rank: row[3] } : {}),
    kick: hasMark(row[4]),
    backup: hasMark(row[5]),
    removed: false,
    transferred: false,
    note: '',
    updatedAt: null,
    updatedBy: null,
  }));

const bdk = bdkRows
  .filter((row) => typeof row[0] === 'number' && typeof row[1] === 'string')
  .map((row) => ({
    id: `bdk-${String(row[0]).padStart(3, '0')}`,
    list: 'bdk',
    number: row[0],
    name: row[1],
    kick: false,
    backup: false,
    removed: false,
    transferred: false,
    note: '',
    updatedAt: null,
    updatedBy: null,
  }));

if (koi.length !== 77 || bdk.length !== 31) {
  throw new Error(`名單筆數不符：KOi=${koi.length}（預期 77）、BDK=${bdk.length}（預期 31）`);
}

const createToken = () => randomBytes(24).toString('base64url');
const seed = {
  event: {
    id: 'koi-bdk-2609',
    title: 'KOi × BDK 賽季轉移',
    capacity: 90,
    active: true,
  },
  invites: {
    r5: createToken(),
    r4: createToken(),
    adm: createToken(),
  },
  members: [...koi, ...bdk],
};

await fs.writeFile(outputPath, `${JSON.stringify(seed, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });

const baseUrl = 'https://rushbq.github.io/LFtime/#/transfer/';
console.log(`已建立 ${outputPath}`);
console.log(`KOi ${koi.length} 人，Kick ${koi.filter((member) => member.kick).length} 人，Backup ${koi.filter((member) => member.backup).length} 人`);
console.log(`BDK ${bdk.length} 人`);
console.log(`R5  ${baseUrl}${seed.invites.r5}`);
console.log(`R4  ${baseUrl}${seed.invites.r4}`);
console.log(`Adm ${baseUrl}${seed.invites.adm}`);
