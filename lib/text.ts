// أدوات نصية مشتركة (تعمل بدون أي مفتاح).

export const STOPWORDS = new Set([
  'في', 'من', 'على', 'الى', 'إلى', 'عن', 'ان', 'أن', 'إن', 'اذا', 'إذا',
  'هذا', 'هذه', 'ذلك', 'تلك', 'التي', 'الذي', 'اللي', 'و', 'او', 'أو',
  'مع', 'لا', 'ما', 'هو', 'هي', 'كان', 'كانت', 'بعد', 'قبل', 'كل', 'ثم',
  'لكن', 'حتى', 'the', 'and', 'a', 'an', 'of', 'to', 'is', 'in', 'it', 'for', 'on', 'with',
]);

export function tokenize(text: string): string[] {
  return text
    .replace(/[ً-ٰٟـ]/g, '') // إزالة التشكيل والتطويل
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function splitSentences(text: string): string[] {
  return text
    .split(/[.!?؟۔\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function keywords(tokens: string[], limit = 8): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const t of tokens) {
    if (t.length < 2 || STOPWORDS.has(t) || /^\d+$/.test(t)) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

// يحوّل الأرقام العربية-الهندية إلى أرقام لاتينية ويوحّد رموز العمليات
export function normalizeDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',');
}
