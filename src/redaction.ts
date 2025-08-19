export function redactText(text: string, extraSecrets: string[] = []): { text: string; redacted: boolean } {
  let redacted = false;
  let out = String(text ?? '');

  // Exact secrets
  for (const s of extraSecrets.filter(Boolean)) {
    if (!s) continue;
    const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc, 'g');
    if (re.test(out)) {
      out = out.replace(re, '[REDACTED]');
      redacted = true;
    }
  }

  // OpenAI-style keys sk-...
  out = out.replace(/sk-[A-Za-z0-9-_]{16,}/g, () => {
    redacted = true;
    return '[REDACTED_KEY]';
  });

  // Bearer tokens
  out = out.replace(/Bearer\s+[A-Za-z0-9._-]{20,}/gi, () => {
    redacted = true;
    return 'Bearer [REDACTED_TOKEN]';
  });

  // Long hex/base64-like tokens
  out = out.replace(/[A-Za-z0-9+/=_-]{32,}/g, (m) => {
    redacted = true;
    return '[REDACTED_TOKEN]';
  });

  // URL query params containing key/secret/token
  out = out.replace(/([?&](?:api[_-]?key|key|token|secret)=)([^&#]+)/gi, (_m, p1) => {
    redacted = true;
    return p1 + '[REDACTED]';
  });

  return { text: out, redacted };
}

export function redactMessages(
  messages: Array<{ role: string; content: string }>,
  extraSecrets: string[] = []
): { messages: Array<{ role: string; content: string }>; redacted: boolean } {
  let any = false;
  const redactedMsgs = messages.map((m) => {
    const r = redactText(m.content, extraSecrets);
    if (r.redacted) any = true;
    return { ...m, content: r.text };
  });
  return { messages: redactedMsgs, redacted: any };
}
