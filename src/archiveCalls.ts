import * as fs from 'fs';
import * as path from 'path';
import { resolveAiCallsDir } from './recorder';
import { spawn } from 'child_process';
import { path7za as path7zaPkg } from '7zip-bin';

function toDateKey(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDateKeyFromFilename(name: string): string | null {
  // Try modern pattern: vault-bot_YYYYMMDD_
  let m = name.match(/vault-bot_(\d{8})_/);
  if (m) return `${m[1].slice(0,4)}-${m[1].slice(4,6)}-${m[1].slice(6,8)}`;
  // Try legacy/local pattern: vault-bot-local_YYYYMMDD-
  m = name.match(/vault-bot-local_(\d{8})-/);
  if (m) return `${m[1].slice(0,4)}-${m[1].slice(4,6)}-${m[1].slice(6,8)}`;
  return null;
}

async function statSafe(p: string): Promise<fs.Stats | null> {
  try { return await fs.promises.stat(p); } catch { return null; }
}

async function unlinkWithRetry(p: string, retries = 3): Promise<void> {
  for (let i = 0; i <= retries; i++) {
    try {
      await fs.promises.unlink(p);
      return;
    } catch (err: any) {
      if (i === retries) throw err;
      await new Promise(res => setTimeout(res, 200 * (i + 1)));
    }
  }
}

// ZIP fallback removed to guarantee solid compression via 7z only.

async function ensureDir(p: string): Promise<void> {
  await fs.promises.mkdir(p, { recursive: true });
}

function looksLikeDateFolder(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(name);
}

function uniqueName(basename: string, existing: Set<string>): string {
  if (!existing.has(basename)) return basename;
  const ext = path.extname(basename);
  const name = path.basename(basename, ext);
  let i = 2;
  while (i < 1000) {
    const cand = `${name}_${i}${ext}`;
    if (!existing.has(cand)) return cand;
    i++;
  }
  return `${name}_${Date.now()}${ext}`; // last resort
}

async function create7z(target7z: string, files: string[], baseDir: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(target7z), { recursive: true });
  const tmp = `${target7z}.tmp-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

  // Prefer a locally bundled 7za in bin/ near the plugin, with multiple candidate locations, fallback to package binary
  let sevenZipPath = path7zaPkg;
  try {
    const exe = process.platform === 'win32' ? '7za.exe' : '7za';
    const pluginDir = path.dirname(baseDir); // ai-calls' parent is the plugin folder
    const candidates: string[] = [];
    // 1) Plugin folder bin
    candidates.push(path.join(pluginDir, 'bin', exe));
    // 2) Bundle directory bin (when running from built main.js)
    if (typeof __dirname === 'string' && __dirname) {
      candidates.push(path.join(__dirname, 'bin', exe));
    }
    // 3) CWD bin (useful in some test/dev runners)
    candidates.push(path.join(process.cwd(), 'bin', exe));
    // 4) A few ancestors of the plugin folder (handles tests that place bin/ at vault root)
    let cur = path.resolve(pluginDir);
    for (let i = 0; i < 4; i++) {
      cur = path.dirname(cur);
      candidates.push(path.join(cur, 'bin', exe));
    }
    for (const cand of candidates) {
      const st = await statSafe(cand);
      if (st?.isFile()) { sevenZipPath = cand; break; }
    }
  } catch {}

  const rels = files.map(f => path.relative(baseDir, f));
  await new Promise<void>((resolve, reject) => {
    const args = [
      'a',              // add
      '-t7z',           // 7z format
      '-mx=9',          // max compression
      '-m0=lzma2',      // LZMA2 method
      '-ms=on',         // solid compression
      '-mmt=on',        // multithread
      '-spf',           // use fully qualified paths safely
      '-y',             // assume yes
      tmp,
      ...rels
    ];
    const child = spawn(sevenZipPath, args, { cwd: baseDir });
    let stderr = '';
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', async (code) => {
      if (code === 0) {
        try {
          await fs.promises.rename(tmp, target7z).catch(async () => {
            try { await fs.promises.unlink(target7z); } catch {}
            await fs.promises.rename(tmp, target7z);
          });
          resolve();
        } catch (e) {
          reject(e);
        }
      } else {
        try { await fs.promises.unlink(tmp); } catch {}
        reject(new Error(`7z exited with code ${code}: ${stderr}`));
      }
    });
  });
}

export async function zipOldAiCalls(appLike?: any, now: Date = new Date()): Promise<void> {
  const dir = resolveAiCallsDir(appLike);

  let entries: string[] = [];
  try {
    entries = await fs.promises.readdir(dir);
  } catch {
    // No directory yet; nothing to do
    return;
  }

  const todayKey = toDateKey(now);
  const dateFolders = new Set<string>();

  // First pass: move prior-day files into date folders; collect pre-existing date folders
  for (const name of entries) {
    if (name.startsWith('.')) continue; // hidden/temp
    if (name.endsWith('.zip') || name.endsWith('.7z')) continue; // already archived
    if (name.includes('.tmp-') || name.includes('.partial-')) continue; // partials
    if (looksLikeDateFolder(name)) {
      if (name !== todayKey) dateFolders.add(name);
      continue;
    }

    const abs = path.join(dir, name);
    const st = await statSafe(abs);
    if (!st) continue;

    if (st.isDirectory()) {
      // Skip unexpected directories except date folders
      continue;
    }

    let key = parseDateKeyFromFilename(name);
    if (!key) key = toDateKey(new Date(st.mtime));
    if (key === todayKey) continue; // don't touch today's files

    const targetFolder = path.join(dir, key);
    await ensureDir(targetFolder);
    // Avoid overwriting if same basename exists
    const existing = new Set<string>(await fs.promises.readdir(targetFolder));
    const finalBase = uniqueName(path.basename(name), existing);
    const dest = path.join(targetFolder, finalBase);
    await fs.promises.rename(abs, dest);
    dateFolders.add(key);
  }

  // Second pass: solid-compress each date folder as one unit
  for (const key of Array.from(dateFolders).sort()) {
    const folderPath = path.join(dir, key);
    const st = await statSafe(folderPath);
    if (!st || !st.isDirectory()) continue;

    // Choose a 7z filename that doesn't overwrite existing archives
    const baseName7z = `ai-calls_${key}.7z`;
    let archivePath = path.join(dir, baseName7z);
    let counter = 2;
    while (await statSafe(archivePath)) {
      const altName = `ai-calls_${key}_${counter}.7z`;
      archivePath = path.join(dir, altName);
      counter++;
      if (counter > 1000) break; // safety
    }

    try {
      // Pass the folder itself so the archive contains the date directory and is solid across its files
      await create7z(archivePath, [folderPath], dir);
      // Remove the date folder after successful archive
      try { await fs.promises.rm(folderPath, { recursive: true, force: true }); } catch (err) {
        console.error('Failed to remove date folder after zipping:', folderPath, err);
      }
    } catch (err) {
      console.error('Failed to create 7z for', key, err);
      // No fallback: keep the folder with files to maintain data integrity.
    }
  }
}

export default zipOldAiCalls;
