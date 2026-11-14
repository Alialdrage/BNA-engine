// رد محلي على التحيات والمجاملات (بلا ذكاء اصطناعي)
const norm = (s: string) =>
  s.toLowerCase().replace(/[ً-ٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/[؟?!.,،؛:]/g, ' ').replace(/\s+/g, ' ').trim();

const RULES: Array<[RegExp, string]> = [
  [/^(السلام عليكم|سلام عليكم|سلام|السلام)( ورحمه الله( وبركاته)?)?$/, 'وعليكم السلام ورحمة الله وبركاته 🌹 كيف أقدر أساعدك؟'],
  [/^(مرحبا|مرحبتين|اهلا|اهلين|هلا|هلو|هاي|هلا والله|اهلا وسهلا|مرحبا بك)( بك| بيك)?$|^(hi|hello|hey)$/, 'أهلاً بيك! 👋 اكتب لي ما تريد: صورة، برنامج، بحث، تلخيص أو أي سؤال.'],
  [/^(صباح الخير|صباح النور)$/, 'صباح النور والسرور ☀️ شنو تحب أسوي لك اليوم؟'],
  [/^(مساء الخير|مساء النور)$/, 'مساء النور 🌙 تفضل، شنو تريد؟'],
  [/^(شلونك|شلونكم|كيفك|كيف حالك|شخبارك|شلون الحال|شلونك اليوم)$/, 'الحمد لله تمام 😊 وإنت شلونك؟ كيف أقدر أخدمك؟'],
  [/^(شكرا|شكرا لك|شكرا جزيلا|مشكور|تسلم|يعطيك العافيه|thanks|thank you)$/, 'العفو، بخدمتك دائماً 🌹'],
  [/^(من انت|منو انت|شنو انت|ما اسمك|شنو اسمك)$/, 'أنا محرك BNA: أكتب البرامج، أولّد الصور، أبحث وألخّص وأحلل وأترجم. اكتب طلبك بس.'],
  [/^(باي|مع السلامه|الى اللقاء|تصبح على خير)$/, 'مع السلامة، بحفظ الله 👋'],
];

export function smallTalkReply(text: string): string | null {
  const t = norm(text);
  if (!t || t.length > 40) return null;
  for (const [re, reply] of RULES) if (re.test(t)) return reply;
  return null;
}

// نيّة توليد برنامج/كود
export function looksLikeCodeRequest(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /(اكتب|سوي|سو|انشئ|أنشئ|ولد|ولّد|برمج|اصنع|صمم|صمّم|اعمل|اريد|أريد|اباچر|ابي)\s.{0,30}(برنامج|كود|سكربت|سكريبت|دالة|تطبيق|موقع|بوت|لعبة|صفحة|api|function|script|program|app|bot)/.test(t) ||
    /(write|create|build|make|generate|code)\s.{0,30}(program|script|function|app|bot|website|class|code|game)/.test(t) ||
    /^(برنامج|كود|سكربت|برمجة)\b/.test(t)
  );
}

export function looksLikeImageRequest(text: string): boolean {
  return /(ارسم|رسم|ولد|ولّد|صمم|صمّم|اعمل|سوي|اريد|أريد|انشئ|أنشئ)\s.{0,20}(صوره|صورة|لوحه|لوحة|شعار|لوغو|رسمه|رسمة)|^(صورة|صوره)\s|(draw|generate|create|make)\s.{0,20}(image|picture|logo|photo)/i.test(text);
}

// طلب مشروع كامل: تطبيق/APK/ZIP/موقع كامل
export function looksLikeBuildRequest(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(apk|zip)\b|اندرويد|أندرويد|android|ملف مضغوط|مشروع كامل|مشروع متكامل/.test(t) ||
    /(ابن[يِ]|ابني|انشئ|أنشئ|اعمل|سوي|اصنع|صمم|صمّم|اريد|أريد)\s.{0,25}(تطبيق|موقع|لعبة|مشروع)/.test(t) ||
    /(build|create|make)\s.{0,25}(app|website|web app|project|game)/.test(t)
  );
}
