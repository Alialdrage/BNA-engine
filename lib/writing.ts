// أدوات الكتابة المحلية (بلا ذكاء اصطناعي): كشف الحشو والعبارات الجاهزة وقياس قابلية القراءة.
import { splitSentences, tokenize } from './text';

export const CLICHES = [
  'في عالم اليوم', 'في عصرنا الحالي', 'في الآونة الأخيرة', 'لا شك أن', 'لا يخفى على أحد',
  'من المعروف أن', 'يجب أن نعلم أن', 'في نهاية المطاف', 'على الصعيد', 'بشكل عام',
  'تجدر الإشارة إلى', 'من الجدير بالذكر', 'ومما لا شك فيه', 'يعتبر من أهم', 'يلعب دوراً كبيراً',
  'يلعب دورا كبيرا', 'في غاية الأهمية', 'لا غنى عنه', 'ثورة حقيقية', 'خير دليل على ذلك',
  'في ظل', 'بصفة عامة', 'كما هو معلوم', 'مما لا يدع مجالا للشك', 'مما لا يدع مجالاً للشك',
  'في هذا السياق', 'على كل حال', 'الجدير بالذكر',
];

const FILLERS = ['جداً', 'جدا', 'حقاً', 'حقا', 'فعلاً', 'فعلا', 'للغاية', 'تماماً', 'بالتأكيد', 'ببساطة', 'حرفياً', 'نوعاً ما'];

const STOP = new Set(['في', 'من', 'على', 'إلى', 'الى', 'عن', 'أن', 'ان', 'إن', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'كان', 'مع', 'ما', 'لا', 'أو', 'او', 'و', 'ثم', 'قد', 'هو', 'هي']);

export function writingCheck(text: string): string[] {
  const out: string[] = [];
  const found = CLICHES.filter((c) => text.includes(c));
  out.push(
    found.length
      ? `عبارات جاهزة تُضعف النص (${found.length}): ${found.map((c) => `«${c}»`).join('، ')} — احذفها أو ابدأ بالفكرة مباشرة.`
      : 'لا عبارات جاهزة مشهورة. جيد.',
  );
  const fillers = FILLERS.map((f) => [f, text.split(f).length - 1] as const).filter(([, n]) => n > 0);
  if (fillers.length) out.push(`كلمات حشو: ${fillers.map(([f, n]) => `${f} (${n})`).join('، ')} — احذف ما لا يغيّر المعنى.`);

  const sentences = splitSentences(text);
  const lens = sentences.map((s) => tokenize(s).length);
  if (lens.length) {
    const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
    out.push(`متوسط طول الجملة: ${avg.toFixed(1)} كلمة${avg > 25 ? ' — طويل، قسّم الجمل' : avg < 6 ? ' — قصير جداً، قد يبدو متقطعاً' : ' — مناسب'}.`);
    const longIdx = lens.map((n, i) => [n, i] as const).filter(([n]) => n > 35);
    for (const [n, i] of longIdx.slice(0, 3)) out.push(`جملة طويلة (${n} كلمة): «${sentences[i].slice(0, 60)}…»`);
  }
  const counts = new Map<string, number>();
  for (const t of tokenize(text)) if (t.length > 3 && !STOP.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
  const rep = [...counts].filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (rep.length) out.push(`كلمات مكررة كثيراً: ${rep.map(([w, n]) => `${w} (${n})`).join('، ')} — نوّع الألفاظ.`);
  const starts = new Map<string, number>();
  for (const s of sentences) { const w = tokenize(s)[0]; if (w) starts.set(w, (starts.get(w) ?? 0) + 1); }
  const sameStart = [...starts].filter(([, n]) => n >= 3);
  if (sameStart.length) out.push(`جمل كثيرة تبدأ بنفس الكلمة: ${sameStart.map(([w, n]) => `${w} (${n})`).join('، ')}.`);
  return out;
}
