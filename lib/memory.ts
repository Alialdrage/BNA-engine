// ذاكرة المستخدم: حقائق وتفضيلات تُحفظ في المتصفح وتُرسل مع الطلبات كسياق. تُستورد من تصدير مساعد آخر وتُصدَّر بنفس الصيغة.
// آمنة للمتصفح والخادم. كل ما فيها بيانات سياقية وليست أوامر.

export const MEMORY_CATEGORIES = ['instructions', 'identity', 'career', 'projects', 'preferences'] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];
export type MemoryItem = { id: string; category: MemoryCategory; text: string };

export const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  instructions: 'تعليمات',
  identity: 'هوية',
  career: 'مهنة',
  projects: 'مشاريع',
  preferences: 'تفضيلات',
};

export const MAX_MEMORY_ITEMS = 60;
export const MAX_ITEM_CHARS = 300;
export const MAX_MEMORY_SEND = 2000;

// ما لا نخزّنه أبداً: أسرار وأرقام حساسة. وأوامر موجهة للنموذج (حقن).
const SECRET = /(sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,}|xox[bap]-[A-Za-z0-9-]{10,}|\b(?:\d[ -]?){13,19}\b|\bIBAN\b|password\s*[:=]|كلمة (?:ال)?مرور\s*[:=]|api[_ -]?key\s*[:=]|Bearer\s+[A-Za-z0-9._-]{20,})/i;
const INJECTION = /(ignore (?:all |any )?(?:the )?(?:previous|prior|above) (?:instructions|rules)|disregard (?:your|the) (?:instructions|guidelines)|you are now|system prompt|تجاهل (?:كل |جميع )?(?:ال)?(?:تعليمات|القواعد)|انسَ (?:كل |جميع )?تعليماتك|تصرف كأنك|لا تعارضني|وافقني دائماً|وافقني دائما)/i;
const URL_RE = /https?:\/\/\S+|www\.\S+/gi;

export function cleanItemText(raw: string): string | null {
  const t = raw.replace(URL_RE, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_ITEM_CHARS);
  if (t.length < 3 || SECRET.test(t) || INJECTION.test(t)) return null;
  return t;
}

const newId = () => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const HEADER_MAP: Array<[RegExp, MemoryCategory]> = [
  [/instruction|تعليمات/i, 'instructions'],
  [/identity|هوية/i, 'identity'],
  [/career|مهنة|وظيفة/i, 'career'],
  [/project|مشاريع|مشروع/i, 'projects'],
  [/preference|تفضيلات/i, 'preferences'],
];

export type ImportResult = { items: MemoryItem[]; skipped: { secrets: number; injection: number; duplicates: number } };

// يحلل صيغة التصدير القياسية: عناوين ## ثم أسطر "[YYYY-MM-DD] - نص" (أو أسطر نقطية)
export function parseMemoryExport(text: string, existing: MemoryItem[] = []): ImportResult {
  const body = /```[^\n]*\n([\s\S]*?)```/.exec(text)?.[1] ?? text;
  const seen = new Set(existing.map((i) => i.text.toLowerCase()));
  const items: MemoryItem[] = [];
  const skipped = { secrets: 0, injection: 0, duplicates: 0 };
  let cat: MemoryCategory = 'preferences';
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^#{1,4}\s/.test(line) || /^\*\*.+\*\*:?$/.test(line)) {
      const hit = HEADER_MAP.find(([re]) => re.test(line));
      if (hit) cat = hit[1];
      continue;
    }
    const m = /^(?:[-*•]\s*)?(?:\[[^\]]*\]\s*[-–—:]?\s*)?(.+)$/.exec(line);
    if (!m || /^(complete|more remain|this is the)/i.test(m[1])) continue;
    const content = m[1].replace(/^\*\*|\*\*$/g, '').trim();
    if (INJECTION.test(content)) { skipped.injection++; continue; }
    const t = cleanItemText(content);
    if (!t) { if (SECRET.test(content)) skipped.secrets++; continue; }
    if (seen.has(t.toLowerCase())) { skipped.duplicates++; continue; }
    seen.add(t.toLowerCase());
    items.push({ id: newId(), category: cat, text: t });
    if (existing.length + items.length >= MAX_MEMORY_ITEMS) break;
  }
  return { items, skipped };
}

export function normalizeItems(raw: unknown): MemoryItem[] {
  if (!Array.isArray(raw)) return [];
  const out: MemoryItem[] = [];
  for (const r of raw) {
    const o = (typeof r === 'object' && r !== null ? r : {}) as Record<string, unknown>;
    const category = MEMORY_CATEGORIES.find((c) => c === o.category);
    const text = typeof o.text === 'string' ? cleanItemText(o.text) : null;
    if (category && text) out.push({ id: typeof o.id === 'string' ? o.id.slice(0, 40) : newId(), category, text });
    if (out.length >= MAX_MEMORY_ITEMS) break;
  }
  return out;
}

export function addItem(items: MemoryItem[], category: MemoryCategory, raw: string): { items: MemoryItem[] } | { error: string } {
  const text = cleanItemText(raw);
  if (!text) return { error: 'نص غير صالح (قصير، أو يحتوي سراً/رقماً حساساً/أمراً موجهاً للنموذج)' };
  if (items.length >= MAX_MEMORY_ITEMS) return { error: `الحد ${MAX_MEMORY_ITEMS} عنصراً` };
  if (items.some((i) => i.text.toLowerCase() === text.toLowerCase())) return { error: 'موجود مسبقاً' };
  return { items: [...items, { id: newId(), category, text }] };
}

// النص المرسل للخادم مع الطلب (مضغوط، مرتب حسب الفئة)
export function memoryToContext(items: MemoryItem[], max = MAX_MEMORY_SEND): string {
  const lines: string[] = [];
  let len = 0;
  for (const c of MEMORY_CATEGORIES) {
    for (const i of items.filter((x) => x.category === c)) {
      const line = `- (${c}) ${i.text}`;
      if (len + line.length + 1 > max) return lines.join('\n');
      lines.push(line);
      len += line.length + 1;
    }
  }
  return lines.join('\n');
}

// تنظيف على الخادم (لا نثق بالعميل)
export function cleanMemoryContext(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^- \((?:instructions|identity|career|projects|preferences)\) /.test(l) && !SECRET.test(l) && !INJECTION.test(l))
    .join('\n')
    .replace(/"{3,}/g, '"')
    .slice(0, MAX_MEMORY_SEND);
}

// تصدير بصيغة قياسية لنقله إلى مساعد آخر
export function exportMemory(items: MemoryItem[]): string {
  const titles: Record<MemoryCategory, string> = {
    instructions: '1. Instructions', identity: '2. Identity', career: '3. Career', projects: '4. Projects', preferences: '5. Preferences',
  };
  const body = MEMORY_CATEGORIES.map((c) => {
    const rows = items.filter((i) => i.category === c).map((i) => `[unknown] - ${i.text}`);
    return rows.length ? `## ${titles[c]}\n${rows.join('\n')}` : `## ${titles[c]}`;
  }).join('\n\n');
  return `\`\`\`\n${body}\n\`\`\`\nThis is the complete set.`;
}
