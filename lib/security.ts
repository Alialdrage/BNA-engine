// أدوات أمن سيبراني دفاعية محلية (بلا شبكة وبلا ذكاء اصطناعي): تحليل فقط، لا هجوم ولا كسر.

// ---------- JWT ----------
function b64urlJson(part: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function jwtDecode(text: string, now = Date.now()): string[] {
  const token = text.trim().replace(/^bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0].startsWith('eyJ')) return ['الصيغة غير صحيحة: JWT يتكون من ثلاثة أجزاء header.payload.signature تفصلها نقاط.'];
  const h = b64urlJson(parts[0]);
  const p = b64urlJson(parts[1]);
  if (!h || !p) return ['تعذر فك الترميز: الرأس أو الحمولة ليسا JSON صالحاً.'];
  const out = ['⚠️ فك الترميز لا يتحقق من التوقيع، ولا تلصق رموزاً حقيقية من نظام إنتاج.', `الرأس: ${JSON.stringify(h)}`, `الحمولة: ${JSON.stringify(p)}`, '— ملاحظات أمنية —'];
  const alg = String(h.alg ?? '');
  if (!alg) out.push('❌ لا توجد خوارزمية alg في الرأس.');
  else if (alg.toLowerCase() === 'none') out.push('❌ alg=none: رمز بلا توقيع. يجب على الخادم رفضه دائماً.');
  else if (/^HS/i.test(alg)) out.push(`ℹ️ ${alg}: توقيع بسر مشترك؛ تأكد أن السر طويل وعشوائي (32 بايت+) ولا يُكشف للعملاء.`);
  else out.push(`✅ ${alg}: توقيع غير متماثل. تأكد من تثبيت الخوارزمية المسموحة في الخادم (منع تبديل alg).`);
  if (h.jku || h.x5u || h.jwk) out.push('⚠️ يحتوي الرأس jku/x5u/jwk: لا تثق بمفاتيح يحددها الرمز نفسه (خطر حقن المفاتيح).');
  if (h.kid) out.push('ℹ️ يوجد kid: تحقق منه ضد قائمة بيضاء ولا تستعمله في مسار ملف أو استعلام SQL.');
  const num = (v: unknown) => (typeof v === 'number' ? v * 1000 : null);
  const exp = num(p.exp), nbf = num(p.nbf), iat = num(p.iat);
  if (exp === null) out.push('⚠️ لا يوجد exp: الرمز لا ينتهي أبداً.');
  else if (exp < now) out.push(`❌ منتهي الصلاحية منذ ${new Date(exp).toISOString()}.`);
  else {
    const hours = (exp - now) / 3_600_000;
    out.push(`✅ صالح حتى ${new Date(exp).toISOString()}${hours > 24 * 30 ? ' — مدة طويلة جداً، قصّرها وأضف رمز تحديث' : ''}.`);
  }
  if (nbf !== null && nbf > now) out.push(`ℹ️ لم يبدأ بعد (nbf ${new Date(nbf).toISOString()}).`);
  if (iat !== null && iat > now + 300_000) out.push('⚠️ تاريخ الإصدار iat في المستقبل: ساعة غير متزامنة أو رمز مشبوه.');
  if (!p.iss) out.push('ℹ️ لا يوجد iss (المُصدر): تحقق منه إن كان النظام متعدد الجهات.');
  if (!p.aud) out.push('ℹ️ لا يوجد aud (الجمهور): تحقق منه لمنع استخدام الرمز في خدمة أخرى.');
  if (/(password|passwd|secret|ssn|card)/i.test(JSON.stringify(p))) out.push('❌ الحمولة قد تحتوي بيانات حساسة: JWT مرمّز وليس مشفراً، يقرؤه الجميع.');
  return out;
}

// ---------- تعريف الهاش (تعريف فقط، بلا كسر) ----------
export function hashId(text: string): string[] {
  const t = text.trim();
  const out: string[] = [];
  const guide = (weak: boolean) =>
    out.push(
      weak
        ? '⚠️ دوال سريعة كهذه غير مناسبة لتخزين كلمات المرور. استخدم Argon2id أو bcrypt (أو scrypt/PBKDF2) مع ملح فريد.'
        : '✅ دالة مصممة لكلمات المرور (بطيئة ومملّحة). تأكد من ضبط عامل التكلفة بما يناسب عتادك.',
    );
  if (/^\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(t)) { out.push('النوع: bcrypt'); guide(false); }
  else if (/^\$argon2(id|i|d)\$/.test(t)) { out.push(`النوع: Argon2 (${/argon2(id|i|d)/.exec(t)?.[1]})`); guide(false); }
  else if (/^\$6\$/.test(t)) { out.push('النوع: SHA-512 crypt (Unix)'); guide(false); }
  else if (/^\$5\$/.test(t)) { out.push('النوع: SHA-256 crypt (Unix)'); guide(false); }
  else if (/^\$1\$/.test(t)) { out.push('النوع: MD5 crypt (قديم)'); guide(true); }
  else if (/^pbkdf2/i.test(t) || /^\$pbkdf2/i.test(t)) { out.push('النوع: PBKDF2'); guide(false); }
  else if (/^[a-fA-F0-9]+$/.test(t)) {
    const map: Record<number, string> = {
      32: 'MD5 (أو NTLM/MD4)', 40: 'SHA-1 (أو RIPEMD-160)', 56: 'SHA-224', 64: 'SHA-256 (أو SHA3-256/BLAKE2s)',
      96: 'SHA-384', 128: 'SHA-512 (أو SHA3-512/Whirlpool)', 16: 'نصف هاش أو MySQL قديم',
    };
    const kind = map[t.length];
    if (!kind) return [`هاش سداسي بطول ${t.length} حرفاً لا يطابق صيغة شائعة.`];
    out.push(`الطول ${t.length} حرفاً سداسياً ← المرجّح: ${kind}`);
    out.push('الطول وحده لا يحسم النوع؛ السياق (النظام الذي أنتجه) هو الدليل.');
    guide(true);
  } else return ['لا يطابق صيغة هاش معروفة (سداسي أو صيغة crypt/bcrypt/argon2).'];
  out.push('هذه الأداة تُعرّف النوع فقط ولا تكسر الهاش.');
  return out;
}

// ---------- ترويسات HTTP الأمنية ----------
export function headerCheck(text: string): string[] {
  const h = new Map<string, string[]>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const k = m[1].toLowerCase();
    h.set(k, [...(h.get(k) ?? []), m[2]]);
  }
  if (h.size === 0) return ['ألصق ترويسات الاستجابة (Response Headers) كما تظهر في المتصفح أو curl -I، سطر لكل ترويسة.'];
  const out: string[] = [];
  let score = 100;
  const bad = (msg: string, pts: number) => { out.push(`❌ ${msg}`); score -= pts; };
  const warn = (msg: string, pts: number) => { out.push(`⚠️ ${msg}`); score -= pts; };
  const good = (msg: string) => out.push(`✅ ${msg}`);
  const get = (k: string) => h.get(k)?.[0];

  const hsts = get('strict-transport-security');
  if (!hsts) bad('Strict-Transport-Security غير موجود: أضف max-age=31536000; includeSubDomains', 15);
  else {
    const age = Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0);
    if (age < 15_552_000) warn(`HSTS مدته قصيرة (${age}s): الموصى به سنة على الأقل`, 5); else good('HSTS مضبوط');
  }
  const csp = get('content-security-policy');
  if (!csp) bad("Content-Security-Policy غير موجود: خط الدفاع الأهم ضد XSS", 20);
  else {
    if (/'unsafe-inline'|'unsafe-eval'/.test(csp)) warn("CSP يحتوي 'unsafe-inline' أو 'unsafe-eval' فيُضعف الحماية: استخدم nonce أو hash", 8);
    else if (/(^|[\s;])(\*|https?:)(\s|;|$)/.test(csp)) warn('CSP يسمح بمصادر عامة (*): ضيّقها', 5);
    else good('CSP موجود وبلا تساهلات ظاهرة');
  }
  if (!get('x-content-type-options')?.toLowerCase().includes('nosniff')) bad('X-Content-Type-Options: nosniff ناقص', 8); else good('nosniff مفعّل');
  if (!get('x-frame-options') && !/frame-ancestors/i.test(csp ?? '')) bad('لا حماية من التأطير (clickjacking): أضف frame-ancestors في CSP أو X-Frame-Options', 10);
  else good('حماية التأطير موجودة');
  if (!get('referrer-policy')) warn('Referrer-Policy غير موجود: جرّب strict-origin-when-cross-origin', 5); else good('Referrer-Policy موجود');
  if (!get('permissions-policy')) out.push('ℹ️ Permissions-Policy غير موجود (اختياري): قيّد الكاميرا والميكروفون والموقع.');
  const server = get('server');
  if (server && /\d+\.\d+/.test(server)) warn(`Server يكشف الإصدار (${server}): أخفِه`, 4);
  if (get('x-powered-by')) warn(`X-Powered-By يكشف التقنية (${get('x-powered-by')}): احذفه`, 3);
  const acao = get('access-control-allow-origin');
  if (acao === '*' && get('access-control-allow-credentials')?.toLowerCase() === 'true') bad('CORS: Allow-Origin * مع Allow-Credentials true خطر كبير (المتصفح يرفضه لكن الإعداد خاطئ)', 12);
  else if (acao === '*') out.push('ℹ️ CORS مفتوح لكل الأصول (*): مقبول لواجهات عامة فقط.');
  for (const c of h.get('set-cookie') ?? []) {
    const name = c.split('=')[0].trim();
    const miss = [!/;\s*secure/i.test(c) && 'Secure', !/;\s*httponly/i.test(c) && 'HttpOnly', !/;\s*samesite=/i.test(c) && 'SameSite'].filter(Boolean);
    if (miss.length) warn(`الكوكي ${name} ينقصه: ${miss.join('، ')}`, 5); else good(`الكوكي ${name} مضبوط`);
  }
  out.unshift(`التقييم التقريبي: ${Math.max(0, score)}/100`);
  return out;
}

// ---------- فرز السجلات (دفاعي) ----------
const LOG_RULES: Array<[string, RegExp]> = [
  ['حقن SQL محتمل', /(union(\s|%20|\+)+select|or(\s|%20|\+)+1=1|information_schema|sleep\(\d|benchmark\()/i],
  ['اجتياز مسارات', /(\.\.\/|%2e%2e%2f|\.\.%2f|etc\/passwd|win\.ini)/i],
  ['XSS محتمل', /(<script|%3cscript|onerror=|javascript:)/i],
  ['أداة فحص آلية', /(sqlmap|nikto|nmap|masscan|dirbuster|gobuster|wpscan|nuclei|acunetix|zgrab)/i],
  ['استكشاف ملفات حساسة', /(\/\.env|\/\.git\/|wp-login|phpmyadmin|\.aws\/|id_rsa|\/server-status)/i],
  ['فشل مصادقة', /(failed password|authentication failure|invalid user|login failed|\s401\s)/i],
];

export function logScan(text: string): string[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5000);
  if (lines.length === 0) return ['ألصق أسطر سجل (Apache/Nginx أو SSH auth.log أو تطبيق).'];
  const hits = new Map<string, number>();
  const samples = new Map<string, string>();
  const ips = new Map<string, number>();
  const failIps = new Map<string, number>();
  for (const line of lines) {
    const ip = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/.exec(line)?.[1];
    for (const [name, re] of LOG_RULES) {
      if (!re.test(line)) continue;
      hits.set(name, (hits.get(name) ?? 0) + 1);
      if (!samples.has(name)) samples.set(name, line.slice(0, 140));
      if (name === 'فشل مصادقة' && ip) failIps.set(ip, (failIps.get(ip) ?? 0) + 1);
      if (ip) ips.set(ip, (ips.get(ip) ?? 0) + 1);
    }
  }
  const out = [`أسطر محللة: ${lines.length}`];
  if (hits.size === 0) return [...out, '✅ لا مؤشرات هجوم واضحة بالأنماط المعروفة (هذا لا يثبت خلو السجل).'];
  for (const [name, n] of [...hits].sort((a, b) => b[1] - a[1])) out.push(`🔎 ${name}: ${n} — مثال: ${samples.get(name)}`);
  const brute = [...failIps].filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (brute.length) out.push(`🚨 اشتباه تخمين كلمات مرور: ${brute.map(([ip, n]) => `${ip} (${n})`).join('، ')}`);
  const top = [...ips].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (top.length) out.push(`أكثر العناوين ظهوراً في الأحداث المشبوهة: ${top.map(([ip, n]) => `${ip} (${n})`).join('، ')}`);
  out.push('توصيات: حدّ للطلبات وحظر مؤقت للعناوين المتكررة، WAF، قفل الحساب بعد محاولات فاشلة، مصادقة متعددة العوامل، ومراجعة أن الطلبات المشبوهة لم تنجح (أكواد 200 على مسارات حساسة).');
  out.push('هذه محاولات مرصودة وليست دليلاً على اختراق ناجح.');
  return out;
}

// ---------- CVSS v3.1 ----------
const W = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }, AC: { L: 0.77, H: 0.44 }, UI: { N: 0.85, R: 0.62 },
  CIA: { H: 0.56, L: 0.22, N: 0 },
} as const;

function roundUp(x: number): number {
  const i = Math.round(x * 100000);
  return i % 10000 === 0 ? i / 100000 : (Math.floor(i / 10000) + 1) / 10;
}

export function cvss31(vector: string): { score: number; severity: string } | null {
  const m = new Map<string, string>();
  for (const part of vector.trim().split('/')) {
    const [k, v] = part.split(':');
    if (k && v) m.set(k, v);
  }
  if (m.get('CVSS') !== '3.1' && m.get('CVSS') !== '3.0') return null;
  const AV = W.AV[m.get('AV') as keyof typeof W.AV], AC = W.AC[m.get('AC') as keyof typeof W.AC], UI = W.UI[m.get('UI') as keyof typeof W.UI];
  const C = W.CIA[m.get('C') as keyof typeof W.CIA], I = W.CIA[m.get('I') as keyof typeof W.CIA], A = W.CIA[m.get('A') as keyof typeof W.CIA];
  const scope = m.get('S');
  const prKey = m.get('PR');
  if ([AV, AC, UI, C, I, A].some((v) => v === undefined) || (scope !== 'U' && scope !== 'C')) return null;
  const prTable = scope === 'U' ? { N: 0.85, L: 0.62, H: 0.27 } : { N: 0.85, L: 0.68, H: 0.5 };
  const PR = prTable[prKey as keyof typeof prTable];
  if (PR === undefined) return null;
  const iss = 1 - (1 - C) * (1 - I) * (1 - A);
  const impact = scope === 'U' ? 6.42 * iss : 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15);
  const expl = 8.22 * AV * AC * PR * UI;
  let score = 0;
  if (impact > 0) score = scope === 'U' ? roundUp(Math.min(impact + expl, 10)) : roundUp(Math.min(1.08 * (impact + expl), 10));
  const severity = score === 0 ? 'None' : score < 4 ? 'Low' : score < 7 ? 'Medium' : score < 9 ? 'High' : 'Critical';
  return { score, severity };
}

export function cvssTool(text: string): string[] {
  const v = /CVSS:3\.[01]\/[A-Z:\/]+/.exec(text.trim().toUpperCase())?.[0];
  if (!v) return ['أدخل متجه CVSS v3.1 مثل: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'];
  const r = cvss31(v);
  if (!r) return ['متجه غير صالح: تأكد من وجود AV وAC وPR وUI وS وC وI وA بقيم صحيحة.'];
  const ar: Record<string, string> = { None: 'لا شيء', Low: 'منخفضة', Medium: 'متوسطة', High: 'عالية', Critical: 'حرجة' };
  return [`الدرجة الأساسية: ${r.score.toFixed(1)} — الخطورة: ${r.severity} (${ar[r.severity]})`, `المتجه: ${v}`];
}
