// تنسيق المصادر المرافقة لنتائج البحث في الويب.
export type Source = { url: string; title: string };

export function safeUrl(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  try {
    const p = new URL(u);
    return p.protocol === 'https:' || p.protocol === 'http:' ? p.toString() : null;
  } catch {
    return null;
  }
}

export function addSource(map: Map<string, Source>, url: unknown, title: unknown) {
  const safe = safeUrl(url);
  if (!safe || map.has(safe)) return;
  const t = typeof title === 'string' && title.trim() ? title.trim().slice(0, 120) : new URL(safe).hostname;
  // الأقواس المربعة في العنوان تكسر صيغة الرابط [عنوان](رابط)، فنستبدلها
  map.set(safe, { url: safe, title: t.replace(/[\n\r]+/g, ' ').replace(/\[/g, '(').replace(/\]/g, ')') });
}

export function formatSources(queries: string[], sources: Source[], limit = 10): string {
  const lines: string[] = [];
  if (queries.length) {
    lines.push(`\n\nاستعلامات البحث: ${[...new Set(queries)].slice(0, 12).join(' | ')}`);
  }
  if (sources.length) {
    lines.push('\nالمصادر:');
    sources.slice(0, limit).forEach((s, i) => lines.push(`${i + 1}. [${s.title}](${s.url.replace(/\(/g, '%28').replace(/\)/g, '%29')})`));
  } else if (queries.length) {
    lines.push('\nلم تُرجع الخدمة مصادر قابلة للعرض.');
  }
  return lines.join('\n');
}

// يحذف قسم الاستعلامات والمصادر من نص الرد (قبل تمريره كمدخل لمهارة أخرى)
export function stripSources(text: string): string {
  const i = text.search(/\n+استعلامات البحث:|\n+المصادر:/);
  return (i >= 0 ? text.slice(0, i) : text).trim();
}
