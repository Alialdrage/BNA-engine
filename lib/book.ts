// استوديو الكتب: نموذج الكتاب، وبناء الأوامر، والتصدير (Markdown / HTML). دوال نقية بلا اعتماد على المتصفح.

export type Chapter = { id: string; title: string; content: string };
export type Book = {
  title: string;
  subtitle: string;
  author: string;
  kind: string; // نوع الكتاب
  audience: string;
  brief: string; // فكرة الكتاب
  chapters: Chapter[];
};

export const EMPTY_BOOK: Book = {
  title: '', subtitle: '', author: '', kind: 'كتاب معرفي', audience: '', brief: '', chapters: [],
};

export const BOOK_KINDS = ['كتاب معرفي', 'رواية', 'مجموعة قصصية', 'ديوان شعر', 'كتاب أطفال', 'دليل عملي', 'كتاب تعليمي'];

export const newId = () => Math.random().toString(36).slice(2, 10);

// ---------- الأوامر ----------

export function outlinePrompt(b: Pick<Book, 'title' | 'kind' | 'audience' | 'brief'>, count: number): string {
  return [
    `ضع مخططاً لـ ${b.kind} بعنوان مبدئي: «${b.title || 'غير محدد'}».`,
    b.audience ? `الجمهور: ${b.audience}.` : '',
    `الفكرة: ${b.brief}`,
    `عدد الفصول: ${count}.`,
    'أجب بكائن JSON فقط، بلا أي نص قبله أو بعده وبلا علامات ```، بهذا الشكل:',
    '{"title":"عنوان الكتاب","subtitle":"عنوان فرعي اختياري","chapters":[{"title":"عنوان الفصل","summary":"ملخص من جملتين لما يحدث أو يُشرح"}]}',
  ].filter(Boolean).join('\n');
}

export function chapterPrompt(b: Book, index: number): string {
  const ch = b.chapters[index];
  const outline = b.chapters.map((c, i) => `${i + 1}. ${c.title}`).join('\n');
  const prev = index > 0 ? b.chapters[index - 1].content.trim().slice(-1500) : '';
  return [
    `اكتب الفصل رقم ${index + 1} فقط من ${b.kind} بعنوان «${b.title}».`,
    b.audience ? `الجمهور: ${b.audience}.` : '',
    `فكرة الكتاب: ${b.brief}`,
    `مخطط الفصول:\n${outline}`,
    `عنوان هذا الفصل: ${ch.title}`,
    prev ? `نهاية الفصل السابق (للاتساق في الأسلوب والأسماء والأحداث):\n${prev}` : '',
    'القواعد: اكتب نص الفصل فقط دون ذكر العنوان أو رقم الفصل. فقرات عادية مفصولة بسطر فارغ، بلا رموز تنسيق مثل # أو * أو -. أسلوب سليم وثابت على طول الكتاب، وحوالي 800 إلى 1200 كلمة. لا تلخّص الفصول القادمة ولا تختم الكتاب إلا إن كان هذا هو الفصل الأخير.',
  ].filter(Boolean).join('\n\n');
}

// ---------- قراءة المخطط ----------

export function parseOutline(raw: string): { title: string; subtitle: string; chapters: Array<{ title: string; summary: string }> } | null {
  const text = raw.replace(/```(?:json)?/gi, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(text.slice(start, end + 1)) as {
      title?: unknown; subtitle?: unknown; chapters?: unknown;
    };
    if (!Array.isArray(o.chapters)) return null;
    const chapters = o.chapters
      .map((c) => {
        const x = (c ?? {}) as { title?: unknown; summary?: unknown };
        return { title: String(x.title ?? '').trim().slice(0, 150), summary: String(x.summary ?? '').trim().slice(0, 400) };
      })
      .filter((c) => c.title)
      .slice(0, 30);
    if (chapters.length === 0) return null;
    return {
      title: typeof o.title === 'string' ? o.title.trim().slice(0, 150) : '',
      subtitle: typeof o.subtitle === 'string' ? o.subtitle.trim().slice(0, 200) : '',
      chapters,
    };
  } catch {
    return null;
  }
}

// ---------- تنظيف نص الفصل ----------

// الذكاء الاصطناعي قد يضيف رموز ماركداون رغم التعليمات، نزيلها لتبقى الفقرات نظيفة في الطباعة
export function cleanChapterText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|\s)\*([^*\n]+)\*/g, '$1$2')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function paragraphs(text: string): string[] {
  return cleanChapterText(text).split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);
}

export function wordCount(b: Book): number {
  return b.chapters.reduce((n, c) => n + (c.content.trim() ? c.content.trim().split(/\s+/).length : 0), 0);
}

export function safeFileName(title: string): string {
  const n = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return n || 'book';
}

// ---------- التصدير ----------

export function bookToMarkdown(b: Book): string {
  const out = [`# ${b.title || 'كتاب بلا عنوان'}`];
  if (b.subtitle) out.push(`### ${b.subtitle}`);
  if (b.author) out.push(`**${b.author}**`);
  out.push('## الفهرس', b.chapters.map((c, i) => `${i + 1}. ${c.title}`).join('\n'));
  b.chapters.forEach((c, i) => {
    out.push(`## ${i + 1}. ${c.title}`, paragraphs(c.content).join('\n\n'));
  });
  return out.join('\n\n') + '\n';
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// جسم الكتاب بصيغة HTML (يُستخدم للطباعة داخل التطبيق وللتصدير المستقل)
export function bookBodyHtml(b: Book): string {
  const toc = b.chapters.map((c) => `<li>${escapeHtml(c.title)}</li>`).join('');
  const chapters = b.chapters
    .map(
      (c, i) =>
        `<section class="chapter"><h2>الفصل ${i + 1}</h2><h3>${escapeHtml(c.title)}</h3>${paragraphs(c.content)
          .map((p) => `<p>${escapeHtml(p)}</p>`)
          .join('')}</section>`,
    )
    .join('');
  return (
    `<section class="cover"><h1>${escapeHtml(b.title || 'كتاب بلا عنوان')}</h1>` +
    (b.subtitle ? `<h4>${escapeHtml(b.subtitle)}</h4>` : '') +
    (b.author ? `<p class="author">${escapeHtml(b.author)}</p>` : '') +
    `</section><section class="toc"><h2>الفهرس</h2><ol>${toc}</ol></section>${chapters}`
  );
}

export const BOOK_CSS = `
.book-doc{font-family:'Noto Naskh Arabic','Amiri','Traditional Arabic',Georgia,serif;color:#111;background:#fff;line-height:2;font-size:13pt;direction:rtl;text-align:justify}
.book-doc .cover{text-align:center;min-height:90vh;display:flex;flex-direction:column;justify-content:center;page-break-after:always;break-after:page}
.book-doc .cover h1{font-size:34pt;margin:0 0 .4em}.book-doc .cover h4{font-size:16pt;font-weight:400;margin:0 0 2em;color:#444}
.book-doc .author{font-size:15pt}.book-doc .toc{page-break-after:always;break-after:page}
.book-doc .toc ol{padding-inline-start:0;list-style:decimal inside}
.book-doc .chapter{page-break-before:always;break-before:page}
.book-doc .chapter h2{font-size:14pt;color:#555;margin:0;text-align:center}.book-doc .chapter h3{font-size:22pt;margin:.2em 0 1em;text-align:center}
.book-doc p{margin:0 0 .8em;text-indent:1.5em}
@page{margin:2.2cm}
`;

export function bookToHtml(b: Book): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(b.title || 'كتاب')}</title><style>body{margin:0;padding:2rem;max-width:42rem;margin-inline:auto;background:#fff}${BOOK_CSS}</style></head><body><main class="book-doc">${bookBodyHtml(b)}</main></body></html>`;
}
