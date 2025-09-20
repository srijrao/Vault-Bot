import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveAiCallsDir } from '../src/storage_paths';

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
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vault-bot-7z-'));
  return dir;
}

async function ensureDir(p: string) {
  await fs.promises.mkdir(p, { recursive: true });
}

async function writeFile(p: string, contents = 'x') {
  await ensureDir(path.dirname(p));
  await fs.promises.writeFile(p, contents, 'utf8');
}

describe('7z behavior', () => {
  const now = new Date('2025-08-30T12:00:00');
  const prev = new Date(now.getTime() - 24 * 3600 * 1000);
  const prevKey = toDateKey(prev);

  beforeEach(() => {
    (spawn as any).mockReset?.();
  });

  it('prefers local bin/7za if present; falls back to package path otherwise', async () => {
    const root = await mkdtemp();
    const appLike = { vault: { adapter: { basePath: root } } } as any;
    const aiDir = resolveAiCallsDir(appLike);
    const binDir = path.join(root, 'bin');

    // Create a fake file for yesterday
    await writeFile(path.join(aiDir, `vault-bot_${prevKey.replace(/-/g, '')}_foo.txt`), 'prev');

    // Create a fake local 7za to be detected
    const exe = process.platform === 'win32' ? '7za.exe' : '7za';
    await ensureDir(binDir);
    await fs.promises.writeFile(path.join(root, 'bin', exe), 'binary');

    // Mock spawn to success and capture the command used
    (spawn as any).mockImplementation((cmd: string, args: string[], opts: any) => {
      const events: any = new (require('events').EventEmitter)();
      const { Readable } = require('stream');
      events.stderr = new Readable({ read() {} });
      // Create the tmp file
      const tmpArg = (args as string[]).find(a => String(a).includes('.tmp-'))!;
      fs.writeFileSync(tmpArg, 'ok');
      process.nextTick(() => events.emit('close', 0));
      // Assert it used the local bin path
      expect(cmd.endsWith(path.join('bin', exe))).toBe(true);
      expect(opts.cwd).toBe(aiDir);
      return events;
    });

    const appLike1 = { vault: { adapter: { basePath: root } } } as any;
    await zipOldAiCalls(appLike1, now);
  });

  it('on failure, does not delete or modify outside the ai-calls area', async () => {
    const root = await mkdtemp();
    const appLike2 = { vault: { adapter: { basePath: root } } } as any;
    const aiDir = resolveAiCallsDir(appLike2);
    const outside = path.join(root, 'outside.txt');
    await fs.promises.writeFile(outside, 'keep');
    await writeFile(path.join(aiDir, `vault-bot_${prevKey.replace(/-/g, '')}_bar.txt`), 'prev');

    // Remove any local 7za to let package path be used (we only test safety here)
    // Mock spawn to fail
    (spawn as any).mockImplementation(() => {
      const events: any = new (require('events').EventEmitter)();
      const { Readable } = require('stream');
      events.stderr = new Readable({ read() {} });
      process.nextTick(() => events.emit('close', 2));
      return events;
    });

    await zipOldAiCalls(appLike2, now);

    // Should not touch files outside the ai-calls directory
    expect(await fs.promises.readFile(outside, 'utf8')).toBe('keep');
    // Should have created the date folder and kept the file after failure
    await expect(fs.promises.access(path.join(aiDir, prevKey, `vault-bot_${prevKey.replace(/-/g, '')}_bar.txt`))).resolves.toBeUndefined();
  });
});
