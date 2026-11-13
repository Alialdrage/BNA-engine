// قائمة المحركات: ملف خفيف آمن للاستيراد من المتصفح (لا يعتمد على مكتبات الخادم).

export const ENGINES = [
  { id: 'AUTO', name: 'تلقائي', icon: '⚡', group: 'ai' },
  { id: 'ML', name: 'ذكاء اصطناعي', icon: '🧠', group: 'ai' },
  { id: 'NLP', name: 'لغة عراقية', icon: '💬', group: 'ai' },
  { id: 'GEMINI4', name: 'Gemini 4', icon: '💎', group: 'ai' },
  { id: 'GEMINI38', name: 'Gemini 3.8', icon: '✨', group: 'ai' },
  { id: 'TRANSLATE', name: 'ترجمة', icon: '🌍', group: 'ai' },
  { id: 'CODE', name: 'مبرمج', icon: '👨‍💻', group: 'ai' },
  { id: 'WRITER', name: 'كاتب', icon: '✍️', group: 'ai' },
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
  { id: 'TEXT', name: 'تنظيف', icon: '🧹', group: 'local' },
  { id: 'PASSWORD', name: 'كلمة مرور', icon: '🔑', group: 'local' },
] as const;

export type EngineId = (typeof ENGINES)[number]['id'];
export type ConcreteEngine = Exclude<EngineId, 'AUTO'>;

export const ENGINE_IDS = ENGINES.map((e) => e.id) as EngineId[];

export const MAX_INPUT_LENGTH = 20000;
