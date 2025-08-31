import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));
import { spawn } from 'child_process';
import { zipOldAiCalls } from '../src/archiveCalls';

function toDateKey(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function mkdtemp() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vault-bot-zipcalls-'));
  return dir;
}

async function ensureDir(p: string) {
  await fs.promises.mkdir(p, { recursive: true });
}

async function writeFile(p: string, contents = 'data', mtime?: Date) {
  await ensureDir(path.dirname(p));
  await fs.promises.writeFile(p, contents, 'utf8');
  if (mtime) await fs.promises.utimes(p, new Date(), mtime);
}

function buildAppLike(basePath: string) {
  return { vault: { adapter: { basePath } } } as any;
}

function findTmpArg(args: ReadonlyArray<string | number>) {
  const s = args.map(String);
  const cand = s.find(a => a.includes('.tmp-'));
  return cand as string | undefined;
}

describe('zipOldAiCalls', () => {
  let tmpRoot: string;
  const now = new Date('2025-08-30T12:00:00'); // local-based toDateKey
  const todayKey = toDateKey(now);
  const prev = new Date(now.getTime() - 24 * 3600 * 1000);
  const prevKey = toDateKey(prev);

  beforeEach(async () => {
    tmpRoot = await mkdtemp();
  (spawn as any).mockReset?.();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Best-effort cleanup
    try {
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  it('sorts into date folders, then creates solid 7z per previous day and removes the date folder; skips today', async () => {
    const appLike = buildAppLike(tmpRoot);
    const aiDir = path.join(tmpRoot, '.obsidian', 'plugins', 'Vault-Bot', 'ai-calls');

    // Previous day files in both naming schemes + a mtime-based fallback
    await writeFile(path.join(aiDir, `vault-bot_${prevKey.replace(/-/g, '')}_openai_gpt-4o_abcde.txt`), 'prev A');
    await writeFile(path.join(aiDir, `vault-bot-local_${prevKey.replace(/-/g, '')}-openai-openai-gpt-4.1-123.txt`), 'prev B');
    const mtimeFallback = path.join(aiDir, 'random-unnamed.txt');
    await writeFile(mtimeFallback, 'prev C', prev);

    // Today file should be skipped
    await writeFile(path.join(aiDir, `vault-bot_${todayKey.replace(/-/g, '')}_openai_gpt-4o_todays.txt`), 'today');

    // Pre-existing archive to trigger numeric suffix
    await writeFile(path.join(aiDir, `ai-calls_${prevKey}.7z`), 'pre-exist');

    // Mock spawn to simulate 7z success and create the expected tmp output file
  (spawn as any).mockImplementation((cmd: any, args: any[]) => {
      const events: any = new (require('events').EventEmitter)();
      const { Readable } = require('stream');
      events.stderr = new Readable({ read() {} });
      // Create the tmp file the archiver will rename
      const tmpArg = findTmpArg(args)!;
      fs.writeFileSync(tmpArg, 'archive-bytes');
      process.nextTick(() => events.emit('close', 0));
      return events;
  }) as any;

  await zipOldAiCalls(appLike, now);

  // Date folder should not exist after successful archive
  await expect(fs.promises.access(path.join(aiDir, prevKey))).rejects.toBeTruthy();

  // Today file remains in root
    await expect(fs.promises.access(path.join(aiDir, `vault-bot_${todayKey.replace(/-/g, '')}_openai_gpt-4o_todays.txt`))).resolves.toBeUndefined();

    // New archive with suffix should exist, and no .zip fallback
    await expect(fs.promises.access(path.join(aiDir, `ai-calls_${prevKey}_2.7z`))).resolves.toBeUndefined();
    await expect(fs.promises.access(path.join(aiDir, `ai-calls_${prevKey}.zip`))).rejects.toBeTruthy();

  expect(spawn as any).toHaveBeenCalled();
  });

  it('does not fallback; leaves date folder and files if 7z fails', async () => {
    const appLike = buildAppLike(tmpRoot);
    const aiDir = path.join(tmpRoot, '.obsidian', 'plugins', 'Vault-Bot', 'ai-calls');

    await writeFile(path.join(aiDir, `vault-bot_${prevKey.replace(/-/g, '')}_openai_xxx_abcd1.txt`), 'prev only');

    // Mock spawn to fail
  (spawn as any).mockImplementation(() => {
      const events: any = new (require('events').EventEmitter)();
      const { Readable } = require('stream');
      events.stderr = new Readable({ read() {} });
      process.nextTick(() => events.emit('close', 2));
      return events;
  }) as any;

  await zipOldAiCalls(appLike, now);

  // On failure, the file should have been moved into the date folder and the folder should remain
  await expect(fs.promises.access(path.join(aiDir, prevKey))).resolves.toBeUndefined();
  await expect(fs.promises.access(path.join(aiDir, prevKey, `vault-bot_${prevKey.replace(/-/g, '')}_openai_xxx_abcd1.txt`))).resolves.toBeUndefined();
  await expect(fs.promises.access(path.join(aiDir, `ai-calls_${prevKey}.zip`))).rejects.toBeTruthy();

  expect(spawn as any).toHaveBeenCalled();
  });
});
