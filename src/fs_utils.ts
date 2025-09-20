import * as fs from 'fs';
import * as path from 'path';

/**
 * Atomic file write with OneDrive-safe retry logic
 * Handles file locking scenarios with exponential backoff
 */
export async function writeAtomic(filePath: string, contents: string, maxRetries = 3): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `${path.basename(filePath)}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const data = Buffer.from(contents, 'utf8');
  let fh: fs.promises.FileHandle | null = null;
  try {
    fh = await fs.promises.open(tmp, 'w');
    await fh.write(data, 0, data.length, 0);
    try { await fh.sync(); } catch {}
  } finally {
    if (fh) await fh.close();
  }

  // Attempt atomic rename with simple retry/backoff in case of OneDrive locks
  let attempt = 0;
  while (true) {
    try {
      await fs.promises.rename(tmp, filePath);
      break;
    } catch (err: any) {
      attempt++;
      if (attempt > maxRetries) {
        // Leave a partial to avoid data loss
        const partial = filePath + `.partial-${Date.now()}`;
        try { await fs.promises.rename(tmp, partial); } catch {}
        throw err;
      }
      await new Promise(res => setTimeout(res, 200 * attempt));
    }
  }
}

/**
 * Ensure a directory exists, creating it recursively if needed
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

/**
 * Safe file stat that returns null instead of throwing
 */
export async function statSafe(filePath: string): Promise<fs.Stats | null> {
  try {
    return await fs.promises.stat(filePath);
  } catch {
    return null;
  }
}
