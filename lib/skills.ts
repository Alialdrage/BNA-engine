// مهارات محلية: تعمل بدون أي مفتاح ولا تتصل بأي خدمة خارجية.
import { createHash, randomInt } from 'node:crypto';
import { keywords, normalizeDigits, splitSentences, tokenize } from './text';

// ---------- الحاسبة ومحوّل الوحدات ----------

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function lexMath(src: string): Tok[] {
  const s = normalizeDigits(src)
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/،/g, ',')
    .toLowerCase();
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[\d.]/.test(c)) {
      const m = /^(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i));
      if (!m) throw new Error(`رقم غير صالح عند الموضع ${i + 1}`);
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else if (/[a-z]/.test(c)) {
      const m = /^[a-z]+/.exec(s.slice(i))!;
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
    } else if ('+-*/^%(),'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
    } else {
      throw new Error(`رمز غير مدعوم: ${c}`);
    }
  }
  return out;
}

const FUNCS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  log: Math.log10, ln: Math.log, exp: Math.exp, round: Math.round, floor: Math.floor,
  ceil: Math.ceil, min: Math.min, max: Math.max,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export function evalMath(src: string): number {
  if (src.length > 200) throw new Error('المعادلة طويلة جداً');
  const toks = lexMath(src);
  let p = 0;
  let depth = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === 'op' && (peek() as { v: string }).v === v;

  function expr(): number {
    let v = term();
    while (isOp('+') || isOp('-')) {
      const op = (toks[p++] as { v: string }).v;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function term(): number {
    let v = unary();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = (toks[p++] as { v: string }).v;
      const r = unary();
      if ((op === '/' || op === '%') && r === 0) throw new Error('القسمة على صفر');
      v = op === '*' ? v * r : op === '/' ? v / r : v % r;
    }
    return v;
  }
  function unary(): number {
    if (isOp('-')) { p++; return -unary(); }
    if (isOp('+')) { p++; return unary(); }
    return power();
  }
  function power(): number {
    const base = primary();
    if (isOp('^')) { p++; return Math.pow(base, unary()); }
    return base;
  }
  function primary(): number {
    if (++depth > 50) throw new Error('المعادلة معقدة جداً');
    const tk = toks[p++];
    let v: number;
    if (!tk) throw new Error('المعادلة ناقصة');
    if (tk.t === 'num') {
      v = tk.v;
    } else if (tk.t === 'id') {
      if (tk.v in CONSTS && !isOp('(')) {
        v = CONSTS[tk.v];
      } else if (tk.v in FUNCS) {
        if (!isOp('(')) throw new Error(`الدالة ${tk.v} تحتاج أقواساً`);
        p++;
        const args: number[] = [expr()];
        while (isOp(',')) { p++; args.push(expr()); }
        if (!isOp(')')) throw new Error('قوس غير مغلق');
        p++;
        v = FUNCS[tk.v](...args);
      } else {
        throw new Error(`اسم غير معروف: ${tk.v}`);
      }
    } else if (tk.v === '(') {
      v = expr();
      if (!isOp(')')) throw new Error('قوس غير مغلق');
      p++;
    } else {
      throw new Error(`رمز غير متوقع: ${tk.v}`);
    }
    depth--;
    return v;
  }

  const result = expr();
  if (p < toks.length) throw new Error('المعادلة غير مفهومة');
  if (!Number.isFinite(result)) throw new Error('النتيجة غير محدودة');
  return result;
}

function fmt(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  return String(Number(n.toPrecision(12)));
}

// وحدات القياس: عامل التحويل إلى الوحدة الأساسية في كل فئة
type Unit = { cat: string; f: number; label: string };
const U: Record<string, Unit> = {};
function addUnits(cat: string, label: string, f: number, names: string[]) {
  for (const n of names) U[n] = { cat, f, label };
}
addUnits('length', 'متر', 1, ['m', 'meter', 'متر']);
addUnits('length', 'كيلومتر', 1000, ['km', 'كم', 'كيلومتر']);
addUnits('length', 'سنتيمتر', 0.01, ['cm', 'سم', 'سنتيمتر']);
addUnits('length', 'ملليمتر', 0.001, ['mm', 'ملم', 'مم']);
addUnits('length', 'ميل', 1609.344, ['mi', 'mile', 'miles', 'ميل']);
addUnits('length', 'قدم', 0.3048, ['ft', 'foot', 'feet', 'قدم']);
addUnits('length', 'بوصة', 0.0254, ['in', 'inch', 'بوصة', 'انش', 'إنش']);
addUnits('length', 'ياردة', 0.9144, ['yd', 'yard', 'ياردة']);
addUnits('mass', 'كيلوغرام', 1, ['kg', 'كغم', 'كيلو', 'كلغ', 'كيلوغرام']);
addUnits('mass', 'غرام', 0.001, ['g', 'غرام', 'جرام', 'غم']);
addUnits('mass', 'طن', 1000, ['t', 'ton', 'طن']);
addUnits('mass', 'باوند', 0.45359237, ['lb', 'lbs', 'pound', 'باوند']);
addUnits('mass', 'أونصة', 0.028349523125, ['oz', 'اونصة', 'أونصة']);
addUnits('volume', 'لتر', 1, ['l', 'liter', 'لتر']);
addUnits('volume', 'ملليلتر', 0.001, ['ml', 'مل']);
addUnits('volume', 'غالون', 3.785411784, ['gal', 'gallon', 'غالون']);
addUnits('data', 'بايت', 1, ['b', 'byte', 'بايت']);
addUnits('data', 'كيلوبايت', 1024, ['kb', 'كيلوبايت']);
addUnits('data', 'ميغابايت', 1024 ** 2, ['mb', 'ميغابايت', 'ميجابايت']);
addUnits('data', 'غيغابايت', 1024 ** 3, ['gb', 'غيغابايت', 'جيجابايت']);
addUnits('data', 'تيرابايت', 1024 ** 4, ['tb', 'تيرابايت']);
addUnits('time', 'ثانية', 1, ['s', 'sec', 'ثانية']);
addUnits('time', 'دقيقة', 60, ['min', 'دقيقة']);
addUnits('time', 'ساعة', 3600, ['h', 'hr', 'ساعة']);
addUnits('time', 'يوم', 86400, ['d', 'day', 'days', 'يوم']);
addUnits('time', 'أسبوع', 604800, ['w', 'week', 'أسبوع']);
const TEMP: Record<string, string> = {
  c: 'C', 'مئوية': 'C', 'سيليزية': 'C', f: 'F', 'فهرنهايت': 'F', k: 'K', 'كلفن': 'K',
};
const TEMP_LABEL: Record<string, string> = { C: 'درجة مئوية', F: 'فهرنهايت', K: 'كلفن' };

function convertUnits(text: string): string | null {
  const m = /^\s*(-?[\d.,٠-٩]+)\s*([^\s\d]+)\s+(?:to|in|الى|إلى|->|=>|=)\s*([^\s\d]+)\s*$/i.exec(
    normalizeDigits(text),
  );
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ''));
  const from = m[2].toLowerCase();
  const to = m[3].toLowerCase();
  if (!Number.isFinite(value)) return null;

  if (from in TEMP && to in TEMP) {
    const a = TEMP[from];
    const b = TEMP[to];
    const c = a === 'C' ? value : a === 'F' ? ((value - 32) * 5) / 9 : value - 273.15;
    const r = b === 'C' ? c : b === 'F' ? (c * 9) / 5 + 32 : c + 273.15;
    return `${fmt(value)} ${TEMP_LABEL[a]} = ${fmt(Number(r.toFixed(4)))} ${TEMP_LABEL[b]}`;
  }
  const a = U[from];
  const b = U[to];
  if (!a || !b) return null;
  if (a.cat !== b.cat) {
    return `لا يمكن التحويل بين ${a.label} و${b.label} (فئتان مختلفتان)`;
  }
  const r = (value * a.f) / b.f;
  return `${fmt(value)} ${a.label} = ${fmt(Number(r.toPrecision(10)))} ${b.label}`;
}

export function calc(text: string): string[] {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 20);
  return lines.map((line) => {
    const conv = convertUnits(line);
    if (conv) return conv;
    try {
      return `${line} = ${fmt(evalMath(line))}`;
    } catch (err) {
      return `${line} ← ${err instanceof Error ? err.message : 'تعذر الحساب'}`;
    }
  });
}

export function looksLikeMath(text: string): boolean {
  const t = normalizeDigits(text).trim();
  if (t.length > 200 || !/\d/.test(t)) return false;
  if (!/^[\d\s.,+\-*/^%()×÷]+$/.test(t)) return false;
  return /\d\s*[+\-*/^%×÷]\s*[\d(]/.test(t);
}

// ---------- التاريخ والتقويم الهجري ----------

function todayBaghdad(): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const [y, m, d] = parts.split('-').map(Number);
  return { y, m, d };
}

function dayMs(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d);
}

function describeDate(ms: number): string {
  const dt = new Date(ms);
  const g = new Intl.DateTimeFormat('ar-IQ-u-nu-latn', {
    timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(dt);
  const h = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', {
    timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric',
  }).format(dt);
  return `ميلادي: ${g}\nهجري: ${h}`;
}

export function dateTool(text: string, now = todayBaghdad()): string[] {
  const t = normalizeDigits(text);
  const found: number[] = [];
  if (/اليوم|today|الآن|now/i.test(t)) found.push(dayMs(now.y, now.m, now.d));
  for (const m of t.matchAll(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/g)) {
    found.push(dayMs(+m[1], +m[2], +m[3]));
  }
  for (const m of t.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/g)) {
    found.push(dayMs(+m[3], +m[2], +m[1]));
  }
  const rel = /([+-])\s*(\d{1,6})\s*(?:يوم|أيام|ايام|days?)?\s*$/i.exec(t.trim());
  if (found.length === 0 && rel) {
    const n = (rel[1] === '-' ? -1 : 1) * Number(rel[2]);
    found.push(dayMs(now.y, now.m, now.d) + n * 86400000);
  }
  if (found.length === 0) {
    return ['اكتب تاريخاً مثل 2026-11-13 أو 13/11/2026 أو كلمة "اليوم" أو "+30" لبعد 30 يوماً.'];
  }
  const out: string[] = [];
  found.slice(0, 2).forEach((ms, i) => {
    if (Number.isNaN(new Date(ms).getTime())) {
      out.push('تاريخ غير صالح');
      return;
    }
    out.push(found.length > 1 ? `التاريخ ${i + 1}:` : 'التاريخ:', describeDate(ms));
  });
  if (found.length >= 2) {
    const days = Math.round(Math.abs(found[1] - found[0]) / 86400000);
    out.push(
      `الفرق: ${days} يوم (≈ ${(days / 7).toFixed(1)} أسبوع، ≈ ${(days / 30.4375).toFixed(1)} شهر، ≈ ${(days / 365.25).toFixed(2)} سنة)`,
    );
  } else if (!/اليوم|today|الآن|now/i.test(t)) {
    const diff = Math.round((found[0] - dayMs(now.y, now.m, now.d)) / 86400000);
    out.push(diff === 0 ? 'هذا هو اليوم' : diff > 0 ? `بعد ${diff} يوم من اليوم` : `قبل ${-diff} يوم من اليوم`);
  }
  return out;
}

// ---------- JSON ----------

function jsonStats(v: unknown, depth = 1, acc = { objects: 0, arrays: 0, keys: 0, maxDepth: 1 }) {
  acc.maxDepth = Math.max(acc.maxDepth, depth);
  if (Array.isArray(v)) {
    acc.arrays++;
    v.forEach((x) => jsonStats(x, depth + 1, acc));
  } else if (v && typeof v === 'object') {
    acc.objects++;
    for (const [, x] of Object.entries(v)) {
      acc.keys++;
      jsonStats(x, depth + 1, acc);
    }
  }
  return acc;
}

export function jsonTool(text: string): string[] {
  try {
    const v = JSON.parse(text);
    const s = jsonStats(v);
    const pretty = JSON.stringify(v, null, 2);
    return [
      'JSON صالح ✅',
      `كائنات: ${s.objects} | مصفوفات: ${s.arrays} | مفاتيح: ${s.keys} | أقصى عمق: ${s.maxDepth}`,
      pretty.length > 4000 ? `${pretty.slice(0, 4000)}\n… (تم اقتطاع العرض)` : pretty,
    ];
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'خطأ غير معروف';
    const pos = /position (\d+)/.exec(msg);
    let where = '';
    if (pos) {
      const before = text.slice(0, Number(pos[1]));
      const line = before.split('\n').length;
      const col = before.length - before.lastIndexOf('\n');
      where = ` (السطر ${line}، العمود ${col})`;
    }
    return [`JSON غير صالح ❌${where}`, `التفاصيل: ${msg}`];
  }
}

export function looksLikeJson(text: string): boolean {
  const t = text.trim();
  if (!/^[[{]/.test(t)) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

// ---------- الترميز والتجزئة ----------

export function codec(text: string): string[] {
  const buf = Buffer.from(text, 'utf8');
  const lines = [
    `Base64: ${buf.toString('base64')}`,
    `Hex: ${buf.toString('hex')}`,
    `URL: ${encodeURIComponent(text)}`,
    `SHA-256: ${createHash('sha256').update(buf).digest('hex')}`,
    `SHA-1: ${createHash('sha1').update(buf).digest('hex')}`,
    `MD5: ${createHash('md5').update(buf).digest('hex')}`,
    `الحجم: ${buf.length} بايت`,
  ];
  const t = text.trim();
  if (t.length >= 4 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(t)) {
    try {
      const dec = Buffer.from(t.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      // نقبل فقط إن كان النص الناتج قابلاً للقراءة
      if (dec && !dec.includes('�') && /^[\p{L}\p{N}\p{P}\p{Z}\n\t]+$/u.test(dec)) {
        lines.push(`فك Base64: ${dec}`);
      }
    } catch {
      /* ليس Base64 */
    }
  }
  try {
    const u = decodeURIComponent(t);
    if (u !== t) lines.push(`فك URL: ${u}`);
  } catch {
    /* ليس URL مرمّزاً */
  }
  return lines;
}

// ---------- تنظيف النص ----------

export function cleanText(text: string): string[] {
  const noMarks = text.replace(/[ً-ٰٟـ]/g, '');
  const removedMarks = text.length - noMarks.length;
  const lines = noMarks.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim());
  const seen = new Set<string>();
  const kept: string[] = [];
  let dups = 0;
  let blanks = 0;
  for (const l of lines) {
    if (l === '') {
      blanks++;
      continue;
    }
    if (seen.has(l)) {
      dups++;
      continue;
    }
    seen.add(l);
    kept.push(l);
  }
  return [
    `حُذف: ${removedMarks} من التشكيل والتطويل، ${dups} سطر مكرر، ${blanks} سطر فارغ`,
    'النص المنظف:',
    kept.join('\n'),
  ];
}

// ---------- التلخيص ----------

export function summarize(text: string): string[] {
  const sentences = splitSentences(text);
  if (sentences.length < 4) {
    return ['النص قصير ولا يحتاج تلخيصاً (أقل من 4 جمل).', text.trim()];
  }
  const freq = new Map(keywords(tokenize(text), 40));
  const scored = sentences.map((s, i) => {
    const toks = tokenize(s);
    const score = toks.reduce((n, t) => n + (freq.get(t) ?? 0), 0) / Math.sqrt(toks.length || 1);
    return { s, i, score };
  });
  const take = Math.min(5, Math.max(2, Math.ceil(sentences.length / 4)));
  const picked = [...scored].sort((a, b) => b.score - a.score).slice(0, take).sort((a, b) => a.i - b.i);
  return [
    `ملخص (${picked.length} من ${sentences.length} جملة):`,
    ...picked.map((p) => `• ${p.s}`),
  ];
}

// ---------- تحليل المشاعر ----------

// تطبيع خفيف: توحيد الألف والياء، وحذف "ال" التعريف وتاء/هاء التأنيث الأخيرة
const norm = (w: string) =>
  w
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[ةه]$/, '')
    .replace(/^ال(?=.{3,})/, '');
const POS = new Set(
  ('جميل رائع ممتاز حلو زين احب سعيد شكرا مبدع نجاح ناجح خوش تحفه فخم مرتاح يجنن عظيم مفيد سريع ' +
    'مبروك احسنت جيد حب فرح تمام good great excellent love happy awesome best nice thanks perfect')
    .split(' ').map(norm),
);
const NEG = new Set(
  ('سيئ سيء رديء خربان زفت فاشل حزين غضب اكره بطيء مشكله خطا ضعيف تعبان مزعج كارثه خايس ' +
    'يعصب زعلان كره سيئه bad terrible worst hate sad angry slow broken awful bug')
    .split(' ').map(norm),
);
const NEGATORS = new Set(['لا', 'ما', 'مو', 'ليس', 'لم', 'لن', 'مب', 'not', 'no', 'never', 'dont'].map(norm));

export function sentiment(text: string): string[] {
  const toks = tokenize(text).map(norm);
  let pos = 0;
  let neg = 0;
  toks.forEach((t, i) => {
    const negated = NEGATORS.has(toks[i - 1] ?? '') || NEGATORS.has(toks[i - 2] ?? '');
    if (POS.has(t)) negated ? neg++ : pos++;
    else if (NEG.has(t)) negated ? pos++ : neg++;
  });
  const total = pos + neg;
  const label = total === 0 ? 'محايد / غير واضح' : pos > neg ? 'إيجابي 😊' : neg > pos ? 'سلبي 😞' : 'متوازن 😐';
  const score = total === 0 ? 0 : Math.round(((pos - neg) / total) * 100);
  return [
    `النبرة: ${label}`,
    `كلمات إيجابية: ${pos} | كلمات سلبية: ${neg} | المؤشر: ${score}%`,
    'تقدير قاعدي بالقاموس، للتحليل العميق استخدم محرك الذكاء الاصطناعي.',
  ];
}

// ---------- مولّد كلمات المرور ----------

export function passwordTool(text: string): string[] {
  const n = Number(/\d+/.exec(normalizeDigits(text))?.[0]);
  const len = Number.isFinite(n) && n > 0 ? Math.min(64, Math.max(8, n)) : 16;
  const sets = ['abcdefghijkmnopqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%^&*-_=+?'];
  const all = sets.join('');
  const make = () => {
    const chars = sets.map((s) => s[randomInt(s.length)]);
    while (chars.length < len) chars.push(all[randomInt(all.length)]);
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  };
  const bits = Math.floor(len * Math.log2(all.length));
  return [
    `5 كلمات مرور بطول ${len} (تُولَّد على الخادم بمولّد آمن ولا تُحفظ):`,
    ...Array.from({ length: 5 }, make),
    `القوة التقريبية: ${bits} بت`,
  ];
}
