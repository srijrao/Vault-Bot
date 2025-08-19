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
  // Remove Windows-forbidden characters and trim
  let out = input
    .replace(/[<>:\"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
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
    const utc = formatUtcStamp(start);

    const providerSafe = sanitizeForFilename(provider);
    const modelSafe = sanitizeForFilename(model);
    const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const baseName = `vault-bot-${utc}-${providerSafe}-${modelSafe}-${uniq}.txt`;

    const destPath = path.join(dir, baseName);

    const requestJson = JSON.stringify(request, null, 2);
    const responseJson = JSON.stringify(response, null, 2);
    const fence = chooseFence(requestJson, responseJson);

    let meta: RecordMeta = {
      provider,
      model,
      timestamp: request.timestamp,
      duration_ms: response.duration_ms,
      truncated: response.truncated,
      redacted: params.redacted ?? false,
    };
    // Build once to compute size, then rebuild with size_bytes
    const buildBody = (m: RecordMeta) => {
      let s = '';
      s += '---\n';
      s += `provider: ${m.provider}\n`;
      s += `model: ${m.model}\n`;
      s += `timestamp: ${m.timestamp}\n`;
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
  // Fallback: current working directory ai-calls
  return path.resolve('ai-calls');
}
