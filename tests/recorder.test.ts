import { describe, it, expect } from 'vitest';
import { recordChatCall, resolveAiCallsDir } from '../src/recorder';
import * as fs from 'fs';
import * as path from 'path';
import { vi } from 'vitest';

describe('recordChatCall', () => {
  it('writes a file with YAML header and JSON sections', async () => {
    const dir = resolveAiCallsDir();
    const request = {
      provider: 'openai',
      model: 'openai:gpt-4.1',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hello' },
      ],
      options: { temperature: 0 },
      timestamp: new Date().toISOString(),
    };
    const response = {
      content: 'hi',
      provider: 'openai',
      model: 'openai:gpt-4.1',
      timestamp: new Date().toISOString(),
      duration_ms: 123,
    };

    const res = await recordChatCall({ dir, provider: 'openai', model: 'openai:gpt-4.1', request, response });
    if ('error' in res) throw new Error(res.error);

    const text = await fs.promises.readFile(res.filePath, 'utf8');
    expect(text).toContain('---');
    expect(text).toContain('\n## Request\n');
    expect(text).toContain('\n## Response\n');

    // Extract JSON blocks and ensure they parse
    const blocks = text.split('## ');
    const requestBlock = text.match(/```+json\n([\s\S]*?)\n```+/);
    const responseBlock = text.match(/## Response[\s\S]*?```+json\n([\s\S]*?)\n```+/);
    expect(requestBlock).toBeTruthy();
    expect(responseBlock).toBeTruthy();
    JSON.parse(requestBlock![1]);
    JSON.parse(responseBlock![1]);
  });

  it('creates unique filenames on rapid successive calls', async () => {
    const dir = resolveAiCallsDir();
    const baseRequest = {
      provider: 'openai', model: 'x', messages: [{ role: 'user', content: 'a' }], options: null,
      timestamp: new Date().toISOString(),
    };
    const baseResponse = { content: 'b', provider: 'openai', model: 'x', timestamp: new Date().toISOString(), duration_ms: 1 };

    const files: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await recordChatCall({ dir, provider: 'openai', model: 'x', request: baseRequest, response: baseResponse });
      if ('filePath' in r) files.push(r.filePath);
    }
    const names = new Set(files.map(f => f.split(/[/\\]/).pop()))
    expect(names.size).toBe(files.length);
  });

  it('handles rename failures with retries and partial fallback', async () => {
    const dir = path.join(process.cwd(), 'ai-calls-test');
    await fs.promises.mkdir(dir, { recursive: true });
    const request = {
      provider: 'openai',
      model: 'gpt',
      messages: [{ role: 'user', content: 'hi' }],
      options: null,
      timestamp: new Date().toISOString(),
    };
    const response = {
      content: 'ok',
      provider: 'openai',
      model: 'gpt',
      timestamp: new Date().toISOString(),
      duration_ms: 1,
    };

    const orig = fs.promises.rename;
    let calls = 0;
    // Fail first 4 renames to force partial write
    (fs.promises as any).rename = vi.fn(async (a: string, b: string) => {
      calls++;
      if (calls <= 4) throw new Error('EBUSY');
      return orig(a, b);
    });

    const res = await recordChatCall({ dir, provider: 'openai', model: 'gpt', request, response });
    // Expect an error after exhausting retries
    if (!('error' in res)) throw new Error('Expected error result');

    // Clean up and restore
    (fs.promises as any).rename = orig;
  });
});
