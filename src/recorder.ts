import * as fs from 'fs';
import * as path from 'path';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | string;
  content: string;
}

export interface ChatRequestRecord {
  provider: string;
  model: string;
  messages: ChatMessage[];
  options: Record<string, any> | null;
  timestamp: string; // ISO 8601
}

export interface ChatResponseRecord {
  content: string | null;
  provider: string;
  model: string;
  timestamp: string; // ISO 8601
  duration_ms: number | null;
  truncated?: boolean;
  error?: string;
}

export interface RecordMeta {
  provider: string;
  model: string;
  timestamp: string;
  duration_ms: number | null;
  truncated?: boolean;
  redacted?: boolean;
  size_bytes?: number;
}

function sanitizeForFilename(input: string, maxLen = 40): string {
  // Remove Windows-forbidden characters and normalize to underscores for primary separation
  let out = input
    .replace(/[<>:\"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
  if (out.length > maxLen) out = out.slice(0, maxLen);
  return out || 'unknown';
}

function formatUtcStamp(d: Date): string {
  const pad = (n: number, w = 2) => n.toString().padStart(w, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) + '-' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}

function formatLocalWithOffset(d: Date): string {
  const pad = (n: number, w = 2) => n.toString().padStart(w, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const date = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());

  // timezone offset in minutes (getTimezoneOffset returns minutes behind UTC, so invert sign)
  const tzMin = -d.getTimezoneOffset();
  const sign = tzMin >= 0 ? '+' : '-';
  const tzAbsMin = Math.abs(tzMin);
  const tzHour = pad(Math.floor(tzAbsMin / 60));
  const tzMinute = pad(tzAbsMin % 60);

  // e.g. 2025-08-19 13:58:57 +02:00
  return `${year}-${month}-${date} ${hours}:${minutes}:${seconds} ${sign}${tzHour}:${tzMinute}`;
}

function chooseFence(...blocks: string[]): string {
  // Prefer backticks; increase count until collision-free; fallback to ~ if needed
  for (let ticks = 3; ticks <= 8; ticks++) {
    const fence = '`'.repeat(ticks);
    if (blocks.every(b => !b.includes(fence))) return fence;
  }
  // Fallback
  return '~~~';
}

function ensureLf(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

async function writeAtomic(filePath: string, contents: string, maxRetries = 3): Promise<void> {
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

export async function recordChatCall(params: {
  dir: string; // destination directory
  provider: string;
  model: string;
  request: ChatRequestRecord;
  response: ChatResponseRecord;
  redacted?: boolean;
}): Promise<{ filePath: string } | { error: string } > {
  try {
    const { dir, provider, model, request, response } = params;

    const start = new Date(request.timestamp);

    // Filename-safe local stamp: YYYYMMDD_HHMMSS±HHMM (no colon) for Windows-safe filenames
    const formatLocalStampForFilename = (d: Date): string => {
      const pad = (n: number, w = 2) => n.toString().padStart(w, '0');
      const year = d.getFullYear();
      const month = pad(d.getMonth() + 1);
      const day = pad(d.getDate());
      const hours = pad(d.getHours());
      const minutes = pad(d.getMinutes());
      const seconds = pad(d.getSeconds());
      const tzMin = -d.getTimezoneOffset();
      const sign = tzMin >= 0 ? '+' : '-';
      const tzAbsMin = Math.abs(tzMin);
      const tzHour = pad(Math.floor(tzAbsMin / 60));
      const tzMinute = pad(tzAbsMin % 60);
      return `${year}${month}${day}_${hours}${minutes}${seconds}${sign}${tzHour}${tzMinute}`;
    };
    const localForFile = formatLocalStampForFilename(start);

    // Build a concise filename using underscores, capped around 120 chars, with a short unique suffix
    const MAX_NAME = 120;
    const ext = '.txt';
    const uniq = Math.random().toString(36).slice(2, 7); // short unique suffix
    const prefix = `vault-bot_${localForFile}_`;
    let providerSafe = sanitizeForFilename(provider, 64);
    let modelSafe = sanitizeForFilename(model, 64);

    // Compute dynamic truncation to meet MAX_NAME
    const fixedLen = prefix.length + 1 /* _ between provider & model */ + 1 /* _ before uniq */ + uniq.length + ext.length;
    let remaining = MAX_NAME - fixedLen;
    if (remaining < 16) remaining = 16; // ensure some room

    // Allocate space between provider and model; keep at least 6 chars each
    const minEach = 6;
    let provMax = Math.max(minEach, Math.floor((remaining - 1) / 2)); // -1 for underscore between
    let modelMax = Math.max(minEach, remaining - 1 - provMax);

    providerSafe = sanitizeForFilename(provider, provMax);
    modelSafe = sanitizeForFilename(model, modelMax);

    let baseName = `${prefix}${providerSafe}_${modelSafe}_${uniq}${ext}`;
    if (baseName.length > MAX_NAME) {
      // Further shrink model first, then provider, keeping minimums
      const over = baseName.length - MAX_NAME;
      const modelShrinkable = Math.max(0, modelSafe.length - minEach);
      const modelShrink = Math.min(over, modelShrinkable);
      if (modelShrink > 0) modelSafe = modelSafe.slice(0, modelSafe.length - modelShrink);
      baseName = `${prefix}${providerSafe}_${modelSafe}_${uniq}${ext}`;
      if (baseName.length > MAX_NAME) {
        const over2 = baseName.length - MAX_NAME;
        const provShrinkable = Math.max(0, providerSafe.length - minEach);
        const provShrink = Math.min(over2, provShrinkable);
        if (provShrink > 0) providerSafe = providerSafe.slice(0, providerSafe.length - provShrink);
        baseName = `${prefix}${providerSafe}_${modelSafe}_${uniq}${ext}`;
      }
    }

    const destPath = path.join(dir, baseName);

    const requestJson = JSON.stringify(request, null, 2);
    const responseJson = JSON.stringify(response, null, 2);
    const fence = chooseFence(requestJson, responseJson);

  // Present a human-readable local timestamp (with UTC offset) in the YAML header
  // while preserving the original ISO timestamp inside the JSON blocks.
    let meta: RecordMeta & { timestamp_iso?: string; timestamp_utc_iso?: string } = {
      provider,
      model,
      timestamp: formatLocalWithOffset(start),
      duration_ms: response.duration_ms,
      truncated: response.truncated,
      redacted: params.redacted ?? false,
      timestamp_iso: request.timestamp,
      timestamp_utc_iso: start.toISOString(),
    };
    // Build once to compute size, then rebuild with size_bytes
    const buildBody = (m: RecordMeta & { timestamp_iso?: string; timestamp_utc_iso?: string }) => {
      let s = '';
      s += '---\n';
      s += `provider: ${m.provider}\n`;
      s += `model: ${m.model}\n`;
  // local, human-readable timestamp with UTC offset for quick scanning
  s += `timestamp_local: ${m.timestamp}\n`;
  if ((m as any).timestamp_iso !== undefined) s += `timestamp_iso: ${(m as any).timestamp_iso}\n`;
  if ((m as any).timestamp_utc_iso !== undefined) s += `timestamp_utc_iso: ${(m as any).timestamp_utc_iso}\n`;
      s += `duration_ms: ${m.duration_ms ?? ''}\n`;
      if (m.truncated !== undefined) s += `truncated: ${!!m.truncated}\n`;
      if (m.redacted !== undefined) s += `redacted: ${!!m.redacted}\n`;
      if (m.size_bytes !== undefined) s += `size_bytes: ${m.size_bytes}\n`;
      s += '---\n\n';
      s += '# AI Call\n\n';
      s += '## Request\n\n';
      s += `${fence}json\n${requestJson}\n${fence}\n\n`;
      s += '## Response\n\n';
      s += `${fence}json\n${responseJson}\n${fence}\n`;
      return ensureLf(s);
    };

    let body = buildBody(meta);
    const sizeBytes = Buffer.byteLength(body, 'utf8');
    meta = { ...meta, size_bytes: sizeBytes };
    body = buildBody(meta);

    await writeAtomic(destPath, body);

    // Append size to metadata is not possible post-write without re-write; acceptable as optional.
    return { filePath: destPath };
  } catch (error: any) {
    console.error('Failed to record chat call:', error);
    return { error: error?.message || 'Unknown error' };
  }
}

export function resolveAiCallsDir(appLike?: any): string {
  try {
    // Try to use Obsidian vault path when available
    const basePath = appLike?.vault?.adapter?.basePath || appLike?.vault?.adapter?.getBasePath?.();
    if (basePath && typeof basePath === 'string') {
      return path.join(basePath, '.obsidian', 'plugins', 'Vault-Bot', 'ai-calls');
    }
  } catch {}
  
  // Check if we're in a test environment
  const isTestEnv = process.env.NODE_ENV === 'test' || 
                   process.env.VITEST === 'true' || 
                   typeof global !== 'undefined' && (global as any).__vitest__ ||
                   typeof globalThis !== 'undefined' && (globalThis as any).__vitest__;
  
  // Fallback: use ai-calls-test during tests, ai-calls otherwise
  return path.resolve(isTestEnv ? 'ai-calls-test' : 'ai-calls');
}
