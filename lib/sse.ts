// قارئ Server-Sent Events: يعيد محتوى كل سطر data: كسلسلة نصية.
export async function* sseData(res: Response): AsyncGenerator<string> {
  if (!res.body) throw new Error('الرد فارغ من الخدمة');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  const parse = (block: string): string =>
    block
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n');

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let m: RegExpExecArray | null;
      while ((m = /\r?\n\r?\n/.exec(buf)) !== null) {
        const data = parse(buf.slice(0, m.index));
        buf = buf.slice(m.index + m[0].length);
        if (data) yield data;
      }
    }
    buf += decoder.decode();
    const tail = parse(buf);
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}
