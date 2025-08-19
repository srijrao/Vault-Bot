import { describe, it, expect } from 'vitest';
import { redactText, redactMessages } from '../src/redaction';

describe('redaction', () => {
  it('redacts known key/token patterns', () => {
    const input = 'sk-abcDEF1234567890xyz Token: Bearer abcdefghijklmnopqrstuvwxyz012345 email: a@b.com URL: https://x.com?a=1&api_key=foo';
  const { text, redacted } = redactText(input);
  expect(redacted).toBe(true);
  expect(text).not.toContain('sk-abcDEF');
  expect(text).toContain('[REDACTED_KEY]');
  expect(text).toContain('Bearer [REDACTED_TOKEN]');
  // Emails are intentionally not redacted by default
  expect(text).toContain('a@b.com');
  expect(text).toContain('api_key=[REDACTED]');
  });

  it('redacts extra secrets', () => {
    const { text, redacted } = redactText('my secret value', ['secret value']);
    expect(redacted).toBe(true);
    expect(text).toContain('[REDACTED]');
  });

  it('redacts across messages', () => {
    const r = redactMessages([
      { role: 'system', content: 'sk-12345678901234567890' },
      { role: 'user', content: 'hello a@b.com' },
    ]);
  expect(r.redacted).toBe(true);
  expect(r.messages[0].content).toContain('[REDACTED_KEY]');
  // Emails are not redacted by default; ensure the original email remains
  expect(r.messages[1].content).toContain('a@b.com');
  });
});
