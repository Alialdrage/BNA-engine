// أدوات خارجية يعرّفها مالك الموقع في متغير بيئي EXTERNAL_TOOLS (JSON) ويستدعيها Claude تلقائياً.
// مثال: [{"name":"weather","description":"حالة الطقس لمدينة","url":"https://api.example.com/weather","header":"Authorization","secret":"Bearer xxx"}]
// يُرسل إليها POST {"input": "..."} وترجع نصاً أو JSON. العناوين من البيئة فقط، لا من المستخدم، وكل استدعاء يمر بحارس SSRF.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { ToolDef } from './tools';

export type ExternalTool = { name: string; description: string; url: string; header?: string; secret?: string };

const NAME = /^[a-z][a-z0-9_]{1,30}$/;
const BUILTIN = new Set(['calculate', 'date_info', 'format_json', 'writing_check']);
const MAX_TOOLS = 10;
const MAX_RESPONSE = 20_000;

export function loadExternalTools(raw = process.env.EXTERNAL_TOOLS): ExternalTool[] {
  if (!raw) return [];
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(data)) return [];
  const out: ExternalTool[] = [];
  for (const t of data) {
    const o = (typeof t === 'object' && t !== null ? t : {}) as Record<string, unknown>;
    if (typeof o.name !== 'string' || !NAME.test(o.name) || BUILTIN.has(o.name) || out.some((x) => x.name === o.name)) continue;
    if (typeof o.description !== 'string' || !o.description.trim() || typeof o.url !== 'string') continue;
    let u: URL;
    try { u = new URL(o.url); } catch { continue; }
    if (u.protocol !== 'https:' || u.username || u.password) continue;
    out.push({
      name: o.name,
      description: o.description.slice(0, 300),
      url: u.toString(),
      header: typeof o.header === 'string' && /^[A-Za-z0-9-]{1,40}$/.test(o.header) ? o.header : undefined,
      secret: typeof o.secret === 'string' ? o.secret.slice(0, 500) : undefined,
    });
    if (out.length >= MAX_TOOLS) break;
  }
  return out;
}

export function externalToolDefs(tools = loadExternalTools()): ToolDef[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: { type: 'object', properties: { input: { type: 'string', description: 'مدخل الأداة' } }, required: ['input'] },
  }));
}

// عناوين لا نسمح بالوصول إليها أبداً (شبكات داخلية، loopback، الروابط المحلية، بيانات السحابة)
export function isPrivateAddress(addr: string): boolean {
  const v = isIP(addr);
  if (v === 4) {
    const [a, b] = addr.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  if (v === 6) {
    const l = addr.toLowerCase();
    if (l === '::1' || l === '::' || l.startsWith('fe8') || l.startsWith('fe9') || l.startsWith('fea') || l.startsWith('feb') || /^f[cd]/.test(l)) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  return true;
}

export async function assertPublicHost(host: string): Promise<void> {
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('عنوان داخلي ممنوع');
    return;
  }
  const addrs = await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) throw new Error('عنوان داخلي ممنوع');
}

export async function runExternalTool(name: string, input: string, tools = loadExternalTools()): Promise<string | null> {
  const t = tools.find((x) => x.name === name);
  if (!t) return null;
  try {
    const u = new URL(t.url);
    await assertPublicHost(u.hostname.replace(/^\[|\]$/g, ''));
    const res = await fetch(t.url, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json', ...(t.header && t.secret ? { [t.header]: t.secret } : {}) },
      body: JSON.stringify({ input: input.slice(0, 5000) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return `الأداة رجعت خطأ (${res.status})`;
    const text = (await res.text()).slice(0, MAX_RESPONSE);
    return text || 'رد فارغ';
  } catch (err) {
    return err instanceof Error && err.message.includes('ممنوع') ? err.message : 'تعذر استدعاء الأداة الخارجية';
  }
}
