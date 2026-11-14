// فاحص منافذ TCP (connect فقط) للأصول المصرّح بها. معطّل افتراضياً: يعمل فقط للأهداف المدرجة في SCAN_ALLOWED_HOSTS
// التي يضعها مالك الموقع. بلا فحص خفي (SYN) ولا التقاط لافتات ولا إرسال بيانات: اتصال ثم إغلاق.
import { connect } from 'node:net';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isPrivateAddress } from './external-tools';

export const DEFAULT_PORTS = [21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 443, 445, 993, 995, 1433, 1521, 2049, 3306, 3389, 5432, 5900, 6379, 8000, 8080, 8443, 9200, 27017];
export const MAX_PORTS = 100;
const TIMEOUT_MS = 2000;
const CONCURRENCY = 10;

const SERVICES: Record<number, string> = {
  21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3', 111: 'RPC', 135: 'MS-RPC', 139: 'NetBIOS',
  143: 'IMAP', 443: 'HTTPS', 445: 'SMB', 993: 'IMAPS', 995: 'POP3S', 1433: 'MSSQL', 1521: 'Oracle', 2049: 'NFS', 3306: 'MySQL',
  3389: 'RDP', 5432: 'PostgreSQL', 5900: 'VNC', 6379: 'Redis', 8000: 'HTTP-alt', 8080: 'HTTP-proxy', 8443: 'HTTPS-alt', 9200: 'Elasticsearch', 27017: 'MongoDB',
};

const RISKY: Record<number, string> = {
  21: 'FTP غير مشفّر: استبدله بـ SFTP', 23: 'Telnet غير مشفّر: عطّله واستخدم SSH', 445: 'SMB مكشوف للإنترنت: أغلقه أو ضعه خلف VPN',
  135: 'MS-RPC مكشوف: أغلقه', 139: 'NetBIOS مكشوف: أغلقه', 3389: 'RDP مكشوف: ضعه خلف VPN مع MFA', 5900: 'VNC مكشوف: ضعه خلف VPN',
  3306: 'قاعدة بيانات MySQL مكشوفة: اجعلها داخلية فقط', 5432: 'PostgreSQL مكشوف: اجعله داخلياً', 1433: 'MSSQL مكشوف: اجعله داخلياً',
  1521: 'Oracle مكشوف: اجعله داخلياً', 6379: 'Redis مكشوف: خطر حرج (غالباً بلا مصادقة)', 27017: 'MongoDB مكشوف: اجعله داخلياً',
  9200: 'Elasticsearch مكشوف: اجعله داخلياً', 2049: 'NFS مكشوف: اجعله داخلياً', 111: 'RPC مكشوف: أغلقه',
};

export type PortState = 'open' | 'closed' | 'filtered';
export type ConnectFn = (ip: string, port: number, timeoutMs: number) => Promise<PortState>;

export function parseScanInput(text: string): { host: string; ports: number[] } | { error: string } {
  const tokens = text.trim().split(/\s+/);
  const hostRaw = (tokens[0] ?? '').replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0].replace(/:\d+$/, '').toLowerCase();
  if (!hostRaw || !/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/.test(hostRaw)) {
    return { error: 'اكتب اسم المضيف أو عنوان IPv4 ثم المنافذ اختيارياً، مثل: example.com 22,80,443 أو example.com 1-1024' };
  }
  const spec = tokens.slice(1).join('').trim();
  if (!spec || spec.toLowerCase() === 'top') return { host: hostRaw, ports: DEFAULT_PORTS };
  const set = new Set<number>();
  for (const part of spec.split(',')) {
    const m = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(part);
    if (!m) return { error: `منافذ غير صالحة: «${part}». المثال: 22,80,443 أو 1-1024` };
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b > 65535 || b < a) return { error: 'نطاق منافذ غير صالح (1-65535)' };
    if (b - a + 1 > MAX_PORTS) return { error: `الحد الأقصى ${MAX_PORTS} منفذاً في الطلب الواحد` };
    for (let p = a; p <= b; p++) set.add(p);
    if (set.size > MAX_PORTS) return { error: `الحد الأقصى ${MAX_PORTS} منفذاً في الطلب الواحد` };
  }
  return { host: hostRaw, ports: [...set].sort((x, y) => x - y) };
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

export function isAllowed(host: string, allow = process.env.SCAN_ALLOWED_HOSTS ?? ''): boolean {
  for (const raw of allow.split(',')) {
    const e = raw.trim().toLowerCase();
    if (!e) continue;
    if (e === host) return true;
    if (e.startsWith('*.') && host.endsWith(e.slice(1)) && host.length > e.length - 1) return true;
    const cidr = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(e);
    if (cidr && isIP(host) === 4) {
      const bits = Number(cidr[2]);
      if (bits < 16 || bits > 32) continue; // لا نسمح بنطاقات أوسع من /16
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      if ((ipv4ToInt(host) & mask) === (ipv4ToInt(cidr[1]) & mask)) return true;
    }
  }
  return false;
}

export const tcpConnect: ConnectFn = (ip, port, timeoutMs) =>
  new Promise((resolve) => {
    const s = connect({ host: ip, port });
    const done = (r: PortState) => { s.destroy(); resolve(r); };
    s.setTimeout(timeoutMs, () => done('filtered'));
    s.once('connect', () => done('open'));
    s.once('error', (err: NodeJS.ErrnoException) => done(err.code === 'ECONNREFUSED' ? 'closed' : 'filtered'));
  });

export async function portScan(text: string, opts: { connectFn?: ConnectFn; allow?: string; resolve?: (h: string) => Promise<string[]> } = {}): Promise<string[]> {
  const allow = opts.allow ?? process.env.SCAN_ALLOWED_HOSTS ?? '';
  if (!allow.trim()) {
    return [
      'فاحص المنافذ معطّل. لتفعيله ضع في Vercel المتغير SCAN_ALLOWED_HOSTS بقائمة الأصول التي تملكها أو لديك تفويض بفحصها، مفصولة بفواصل:',
      'مثال: SCAN_ALLOWED_HOSTS=example.com,*.mycompany.com,203.0.113.0/24',
      'لا يُفحص أي هدف خارج القائمة. للفحص الواسع استخدم nmap محلياً من جهازك، أو السكربت scripts/portscan.mjs في المستودع.',
    ];
  }
  const parsed = parseScanInput(text);
  if ('error' in parsed) return [parsed.error];
  if (!isAllowed(parsed.host, allow)) {
    return [`«${parsed.host}» ليس في قائمة الأهداف المصرّح بها (SCAN_ALLOWED_HOSTS). يُفحص فقط ما يملكه صاحب الموقع أو يملك تفويضاً به.`];
  }
  let ips: string[];
  try {
    ips = opts.resolve ? await opts.resolve(parsed.host) : isIP(parsed.host) ? [parsed.host] : (await lookup(parsed.host, { all: true, family: 4 })).map((a) => a.address);
  } catch {
    return [`تعذر تحليل اسم المضيف ${parsed.host}`];
  }
  const ip = ips.find((a) => isIP(a) === 4);
  if (!ip) return ['لا يوجد عنوان IPv4 لهذا المضيف.'];
  if (isPrivateAddress(ip)) return ['العنوان داخلي/خاص: لا يمكن فحصه من هذا الخادم.'];

  const connectFn = opts.connectFn ?? tcpConnect;
  const started = Date.now();
  const results = new Map<number, PortState>();
  const queue = [...parsed.ports];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let p = queue.shift(); p !== undefined; p = queue.shift()) results.set(p, await connectFn(ip, p, TIMEOUT_MS));
    }),
  );
  const open = [...results].filter(([, s]) => s === 'open').map(([p]) => p).sort((a, b) => a - b);
  const closed = [...results.values()].filter((s) => s === 'closed').length;
  const filtered = [...results.values()].filter((s) => s === 'filtered').length;
  const out = [
    `فحص TCP connect لـ ${parsed.host} (${ip}) — ${parsed.ports.length} منفذاً خلال ${((Date.now() - started) / 1000).toFixed(1)} ثانية`,
    open.length ? `🟢 مفتوحة (${open.length}): ${open.map((p) => `${p}${SERVICES[p] ? `/${SERVICES[p]}` : ''}`).join('، ')}` : '🔒 لا منافذ مفتوحة بين المفحوصة.',
    `مغلقة: ${closed} — مرشَّحة/بلا رد (جدار ناري غالباً): ${filtered}`,
  ];
  for (const p of open) if (RISKY[p]) out.push(`⚠️ ${p}: ${RISKY[p]}`);
  out.push('هذا فحص اتصال بسيط: لا يحدد الإصدارات ولا الثغرات، والنتائج قد تختلف حسب موقع الفاحص والجدار الناري.');
  return out;
}
