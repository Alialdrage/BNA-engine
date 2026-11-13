'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BOOK_CSS, BOOK_KINDS, EMPTY_BOOK, bookBodyHtml, bookToHtml, bookToMarkdown, chapterPrompt,
  cleanChapterText, newId, outlinePrompt, parseOutline, safeFileName, wordCount, type Book,
} from '@/lib/book';
import { streamBna } from '@/lib/client-api';

const STORAGE_KEY = 'bna-book-v1';
const field =
  'w-full rounded-xl border border-cyan-300/20 bg-slate-950/60 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-300 focus:shadow-[0_0_20px_rgba(34,211,238,0.25)]';
const btn =
  'rounded-xl border border-cyan-300/30 bg-slate-950/50 px-3 py-2 text-xs font-bold text-cyan-100 transition hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-40';
const primary =
  'rounded-xl bg-gradient-to-r from-cyan-300 via-sky-400 to-indigo-500 px-4 py-2 text-sm font-black text-slate-950 transition hover:shadow-[0_0_25px_rgba(34,211,238,0.6)] disabled:cursor-not-allowed disabled:opacity-40';

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function BookStudio() {
  const [book, setBook] = useState<Book>(EMPTY_BOOK);
  const [count, setCount] = useState(6);
  const [busy, setBusy] = useState<string>(''); // وصف العملية الجارية
  const [error, setError] = useState('');
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bookRef = useRef(book);
  bookRef.current = book;

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const b = JSON.parse(raw) as Book;
        if (b && Array.isArray(b.chapters)) setBook({ ...EMPTY_BOOK, ...b });
      }
    } catch {
      /* لا يوجد تخزين */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(book));
      } catch {
        /* التخزين ممتلئ أو غير متاح */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [book, loaded]);

  const set = <K extends keyof Book>(k: K, v: Book[K]) => setBook((b) => ({ ...b, [k]: v }));
  const patchChapter = (i: number, patch: Partial<Book['chapters'][number]>) =>
    setBook((b) => ({ ...b, chapters: b.chapters.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  const working = busy !== '';

  async function makeOutline() {
    if (!book.brief.trim() || working) return;
    if (book.chapters.some((c) => c.content.trim()) && !confirm('سيُستبدل المخطط الحالي وتُحذف الفصول المكتوبة. متابعة؟')) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy('يضع المخطط…');
    setError('');
    try {
      const raw = await streamBna('AUTHOR', outlinePrompt(book, count), { signal: ctrl.signal });
      const o = parseOutline(raw);
      if (!o) {
        setError(/مفتاح/.test(raw) ? raw.trim() : 'لم أستطع قراءة المخطط من الرد، أعد المحاولة.');
        return;
      }
      setBook((b) => ({
        ...b,
        title: b.title.trim() || o.title,
        subtitle: b.subtitle.trim() || o.subtitle,
        chapters: o.chapters.map((c) => ({ id: newId(), title: c.title, content: '' })),
      }));
      setOpenIdx(0);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : 'تعذر الاتصال');
    } finally {
      setBusy('');
      abortRef.current = null;
    }
  }

  // يكتب فصلاً واحداً ويبثه مباشرة داخل المحرر. يرجع false عند الفشل أو الإيقاف.
  async function writeChapter(i: number, ctrl: AbortController): Promise<boolean> {
    const id = bookRef.current.chapters[i]?.id;
    if (!id) return false;
    setBusy(`يكتب الفصل ${i + 1}…`);
    setOpenIdx(i);
    try {
      const prompt = chapterPrompt(bookRef.current, i);
      const out = await streamBna('AUTHOR', prompt, {
        signal: ctrl.signal,
        onChunk: (full) =>
          setBook((b) => ({ ...b, chapters: b.chapters.map((c) => (c.id === id ? { ...c, content: full } : c)) })),
      });
      const cleaned = cleanChapterText(out);
      if (/مفتاح/.test(cleaned) && cleaned.length < 200) {
        setError(cleaned);
        patchChapterById(id, '');
        return false;
      }
      patchChapterById(id, cleaned);
      return true;
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : 'تعذر الاتصال');
      return false;
    }
  }

  function patchChapterById(id: string, content: string) {
    setBook((b) => ({ ...b, chapters: b.chapters.map((c) => (c.id === id ? { ...c, content } : c)) }));
  }

  async function runOne(i: number) {
    if (working) return;
    if (book.chapters[i].content.trim() && !confirm('سيُستبدل نص الفصل الحالي. متابعة؟')) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError('');
    await writeChapter(i, ctrl);
    setBusy('');
    abortRef.current = null;
  }

  async function runAll() {
    if (working || book.chapters.length === 0) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError('');
    for (let i = 0; i < bookRef.current.chapters.length; i++) {
      if (bookRef.current.chapters[i].content.trim()) continue; // نتخطى المكتوب
      const ok = await writeChapter(i, ctrl);
      if (!ok) break;
    }
    setBusy('');
    abortRef.current = null;
  }

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= book.chapters.length) return;
    setBook((b) => {
      const c = [...b.chapters];
      [c[i], c[j]] = [c[j], c[i]];
      return { ...b, chapters: c };
    });
    setOpenIdx(j);
  }

  function removeChapter(i: number) {
    if (!confirm(`حذف الفصل «${book.chapters[i].title}»؟`)) return;
    setBook((b) => ({ ...b, chapters: b.chapters.filter((_, j) => j !== i) }));
    setOpenIdx(null);
  }

  function newBook() {
    if (!confirm('سيُحذف الكتاب الحالي من متصفحك. صدّره أولاً إن أردت الاحتفاظ به. متابعة؟')) return;
    setBook(EMPTY_BOOK);
    setOpenIdx(null);
    setError('');
  }

  const ready = book.chapters.some((c) => c.content.trim());
  const fileBase = safeFileName(book.title);

  async function exportDocx() {
    try {
      const [{ buildDocx }, { Packer }] = await Promise.all([import('@/lib/book-docx'), import('docx')]);
      download(`${fileBase}.docx`, await Packer.toBlob(buildDocx(book)));
    } catch {
      setError('تعذر إنشاء ملف Word');
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <section className="glass rounded-3xl p-5">
        <h2 className="mb-3 font-black text-cyan-200">📖 بيانات الكتاب</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input aria-label="عنوان الكتاب" placeholder="عنوان الكتاب (اختياري، يقترحه الذكاء الاصطناعي)" className={field} value={book.title} onChange={(e) => set('title', e.target.value)} maxLength={150} />
          <input aria-label="اسم المؤلف" placeholder="اسم المؤلف" className={field} value={book.author} onChange={(e) => set('author', e.target.value)} maxLength={100} />
          <input aria-label="العنوان الفرعي" placeholder="العنوان الفرعي (اختياري)" className={field} value={book.subtitle} onChange={(e) => set('subtitle', e.target.value)} maxLength={200} />
          <input aria-label="الجمهور" placeholder="الجمهور المستهدف (مثال: طلاب الإعدادية)" className={field} value={book.audience} onChange={(e) => set('audience', e.target.value)} maxLength={150} />
          <select aria-label="نوع الكتاب" className={field} value={book.kind} onChange={(e) => set('kind', e.target.value)}>
            {BOOK_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <label className="flex items-center gap-3 text-sm text-cyan-200">
            عدد الفصول
            <input type="number" min={2} max={20} value={count} onChange={(e) => setCount(Math.min(20, Math.max(2, Number(e.target.value) || 6)))} className={`${field} w-24`} />
          </label>
        </div>
        <textarea aria-label="فكرة الكتاب" rows={4} placeholder="اشرح فكرة الكتاب: موضوعه، أهم ما يتناوله، الأسلوب المطلوب…" className={`${field} mt-3 resize-y`} value={book.brief} onChange={(e) => set('brief', e.target.value)} maxLength={4000} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={primary} disabled={working || !book.brief.trim()} onClick={makeOutline}>
            {book.chapters.length ? 'أعد وضع المخطط' : 'ولّد مخطط الكتاب'}
          </button>
          <button type="button" className={btn} disabled={working || book.chapters.length === 0} onClick={runAll}>اكتب كل الفصول الفارغة</button>
          {working && (
            <button type="button" className="rounded-xl border border-rose-400/40 px-3 py-2 text-xs font-bold text-rose-200" onClick={() => abortRef.current?.abort()}>
              إيقاف
            </button>
          )}
          <button type="button" className={`${btn} mr-auto`} disabled={working} onClick={newBook}>كتاب جديد</button>
        </div>
        {working && <p aria-live="polite" className="mt-2 text-sm text-cyan-200">⏳ {busy}</p>}
        {error && <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p>}
      </section>

      {book.chapters.length > 0 && (
        <section className="glass rounded-3xl p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-black text-cyan-200">الفصول ({book.chapters.length}) — {wordCount(book)} كلمة</h2>
            <button type="button" className={btn} disabled={working} onClick={() => { setBook((b) => ({ ...b, chapters: [...b.chapters, { id: newId(), title: 'فصل جديد', content: '' }] })); setOpenIdx(book.chapters.length); }}>
              + فصل
            </button>
          </div>
          <ol className="space-y-2">
            {book.chapters.map((c, i) => {
              const open = openIdx === i;
              return (
                <li key={c.id} className="rounded-2xl border border-cyan-300/15 bg-slate-950/40">
                  <div className="flex items-center gap-2 p-2">
                    <button type="button" aria-expanded={open} aria-label={open ? 'طيّ الفصل' : 'فتح الفصل'} className="w-8 text-cyan-300" onClick={() => setOpenIdx(open ? null : i)}>
                      {open ? '▾' : '◂'}
                    </button>
                    <span className="w-6 text-center text-xs text-cyan-200/70">{i + 1}</span>
                    <input aria-label={`عنوان الفصل ${i + 1}`} className="min-w-0 flex-1 bg-transparent px-1 py-1 text-slate-100 outline-none" value={c.title} onChange={(e) => patchChapter(i, { title: e.target.value })} maxLength={150} />
                    <span className="hidden text-xs text-cyan-200/60 sm:inline">{c.content.trim() ? `${c.content.trim().split(/\s+/).length} كلمة` : 'فارغ'}</span>
                    <button type="button" className={btn} disabled={working} aria-label="تحريك للأعلى" onClick={() => move(i, -1)}>↑</button>
                    <button type="button" className={btn} disabled={working} aria-label="تحريك للأسفل" onClick={() => move(i, 1)}>↓</button>
                  </div>
                  {open && (
                    <div className="border-t border-cyan-300/10 p-3">
                      <textarea aria-label={`نص الفصل ${i + 1}`} rows={14} className={`${field} resize-y leading-loose`} value={c.content} onChange={(e) => patchChapter(i, { content: e.target.value })} placeholder="اكتب بنفسك أو اضغط «اكتب الفصل»" />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" className={btn} disabled={working} onClick={() => runOne(i)}>{c.content.trim() ? 'أعد كتابة الفصل' : 'اكتب الفصل'}</button>
                        <button type="button" className={`${btn} text-rose-200`} disabled={working} onClick={() => removeChapter(i)}>حذف الفصل</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {ready && (
        <section className="glass rounded-3xl p-5">
          <h2 className="mb-1 font-black text-cyan-200">🖨️ التصدير والطباعة</h2>
          <p className="mb-3 text-xs text-cyan-200/70">الغلاف + الفهرس + كل فصل في صفحة جديدة. للحصول على PDF اختر «حفظ كـ PDF» من نافذة الطباعة.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primary} disabled={working} onClick={() => window.print()}>طباعة / PDF</button>
            <button type="button" className={btn} disabled={working} onClick={exportDocx}>Word (.docx)</button>
            <button type="button" className={btn} disabled={working} onClick={() => download(`${fileBase}.html`, new Blob([bookToHtml(book)], { type: 'text/html;charset=utf-8' }))}>HTML</button>
            <button type="button" className={btn} disabled={working} onClick={() => download(`${fileBase}.md`, new Blob([bookToMarkdown(book)], { type: 'text/markdown;charset=utf-8' }))}>Markdown</button>
          </div>
          <p className="mt-3 text-xs text-cyan-200/60">الكتاب محفوظ في متصفحك فقط. صدّره قبل مسح بيانات المتصفح. يُراجَع نص الذكاء الاصطناعي قبل النشر.</p>
        </section>
      )}

      {/* نسخة الطباعة: تُخفى على الشاشة وتظهر وحدها عند الطباعة */}
      {mounted && ready && createPortal(
        <div className="book-print" aria-hidden="true">
          <style>{BOOK_CSS}</style>
          <div className="book-doc" dangerouslySetInnerHTML={{ __html: bookBodyHtml(book) }} />
        </div>,
        document.body,
      )}
    </div>
  );
}
