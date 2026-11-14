// مساعد للمتصفح: يستدعي /api/bna بالبث ويمرر القطع أولاً بأول.
export async function streamBna(
  engine: string,
  input: string,
  opts: { signal?: AbortSignal; onChunk?: (full: string) => void } = {},
): Promise<string> {
  return (await streamBnaFull(engine, input, opts)).text;
}

// نفس الدالة السابقة لكنها ترجع أيضاً اسم المحرك الذي نفّذ الطلب
export async function streamBnaFull(
  engine: string,
  input: string,
  opts: { signal?: AbortSignal; onChunk?: (full: string) => void } = {},
): Promise<{ text: string; label: string }> {
  const res = await fetch('/api/bna', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engine, input, history: [], stream: true }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'تعذر تنفيذ الطلب');
  }
  const label = decodeURIComponent(res.headers.get('X-BNA-Engine') ?? '');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
    opts.onChunk?.(out);
  }
  out += decoder.decode();
  opts.onChunk?.(out);
  return { text: out, label };
}
