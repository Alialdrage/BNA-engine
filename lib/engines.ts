// قائمة المحركات: ملف خفيف آمن للاستيراد من المتصفح (لا يعتمد على مكتبات الخادم).

export const ENGINES = [
  { id: 'AUTO', name: 'تلقائي', icon: '⚡', group: 'ai' },
  { id: 'CHAT', name: 'محادثة', icon: '💭', group: 'ai' },
  { id: 'ML', name: 'ذكاء اصطناعي', icon: '🧠', group: 'ai' },
  { id: 'NLP', name: 'لغة عراقية', icon: '💬', group: 'ai' },
  { id: 'GEMINI4', name: 'Gemini 4', icon: '💎', group: 'ai' },
  { id: 'GEMINI38', name: 'Gemini 3.8', icon: '✨', group: 'ai' },
  { id: 'TRANSLATE', name: 'ترجمة', icon: '🌍', group: 'ai' },
  { id: 'CODE', name: 'مبرمج', icon: '👨‍💻', group: 'ai' },
  { id: 'WRITER', name: 'كاتب', icon: '✍️', group: 'ai' },
  { id: 'WEBSEARCH', name: 'بحث ويب', icon: '🌐', group: 'ai' },
  { id: 'DEEPRESEARCH', name: 'بحث عميق', icon: '🔬', group: 'ai' },
  { id: 'DEEPANALYSIS', name: 'تحليل عميق', icon: '🧩', group: 'ai' },
  { id: 'PROOF', name: 'تدقيق', icon: '🔎', group: 'ai' },
  { id: 'CRITIC', name: 'محرر ناقد', icon: '🧐', group: 'ai' },
  { id: 'TONE', name: 'نبرة', icon: '🎚️', group: 'ai' },
  { id: 'OUTLINE', name: 'مخطط', icon: '🗂️', group: 'ai' },
  { id: 'AUTHOR', name: 'تأليف', icon: '📚', group: 'ai' },
  { id: 'RESEARCHWRITER', name: 'بحث وكتابة', icon: '🖋️', group: 'ai' },
  { id: 'IMAGE', name: 'صور', icon: '🎨', group: 'ai' },
  { id: 'VIDEO', name: 'فيديو', icon: '🎬', group: 'ai' },
  { id: 'GAMEMASTER', name: 'ألغاز', icon: '🎲', group: 'ai' },
  { id: 'DATA', name: 'بيانات', icon: '📊', group: 'local' },
  { id: 'ANALYTICS', name: 'تحليلات', icon: '📈', group: 'local' },
  { id: 'SEARCH', name: 'بحث', icon: '🔍', group: 'local' },
  { id: 'AUTOMATION', name: 'أتمتة', icon: '⚙️', group: 'local' },
  { id: 'SUMMARY', name: 'تلخيص', icon: '📝', group: 'local' },
  { id: 'SENTIMENT', name: 'مشاعر', icon: '🎭', group: 'local' },
  { id: 'CALC', name: 'حاسبة', icon: '🧮', group: 'local' },
  { id: 'DATE', name: 'تاريخ', icon: '📅', group: 'local' },
  { id: 'JSON', name: 'JSON', icon: '🧾', group: 'local' },
  { id: 'CODEC', name: 'ترميز', icon: '🔐', group: 'local' },
  { id: 'WRITECHECK', name: 'فحص الكتابة', icon: '🩺', group: 'local' },
  { id: 'TEXT', name: 'تنظيف', icon: '🧹', group: 'local' },
  { id: 'PASSWORD', name: 'كلمة مرور', icon: '🔑', group: 'local' },
] as const;

export type EngineId = (typeof ENGINES)[number]['id'];
export type ConcreteEngine = Exclude<EngineId, 'AUTO'>;

export const ENGINE_IDS = ENGINES.map((e) => e.id) as EngineId[];

export const MAX_INPUT_LENGTH = 20000;

// اختيار المهارة من داخل صندوق الطلب: "/صور قطة" أو "/translate hello"
export function parseSlash(input: string): { engine: ConcreteEngine; text: string } | null {
  const t = input.trimStart();
  if (!t.startsWith('/')) return null;
  const rest = t.slice(1);
  const names = ENGINES.filter((e) => e.id !== 'AUTO')
    .flatMap((e) => [
      { key: e.name.toLowerCase(), id: e.id },
      { key: e.id.toLowerCase(), id: e.id },
    ])
    .sort((a, b) => b.key.length - a.key.length);
  const lower = rest.toLowerCase();
  for (const n of names) {
    if (lower.startsWith(n.key) && (rest.length === n.key.length || /\s/.test(rest[n.key.length]))) {
      return { engine: n.id as ConcreteEngine, text: rest.slice(n.key.length).trim() };
    }
  }
  return null;
}

// اقتراحات المهارات أثناء كتابة "/..."
export function slashSuggestions(input: string, limit = 8): Array<{ id: ConcreteEngine; name: string; icon: string }> {
  const m = /^\s*\/([^\s]*)$/.exec(input);
  if (!m) return [];
  const q = m[1].toLowerCase();
  return ENGINES.filter((e) => e.id !== 'AUTO' && (e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)))
    .slice(0, limit)
    .map((e) => ({ id: e.id as ConcreteEngine, name: e.name, icon: e.icon }));
}
