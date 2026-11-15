'use client';

import { memo, useState } from 'react';
import {
  CATEGORY_LABELS, MAX_MEMORY_ITEMS, MEMORY_CATEGORIES, addItem, exportMemory, parseMemoryExport,
  type MemoryCategory, type MemoryItem,
} from '@/lib/memory';

const MemoryPanel = memo(function MemoryPanel({
  items, setItems, enabled, setEnabled,
}: {
  items: MemoryItem[];
  setItems: (i: MemoryItem[]) => void;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}) {
  const [text, setText] = useState('');
  const [cat, setCat] = useState<MemoryCategory>('preferences');
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState('');
  const [preview, setPreview] = useState<ReturnType<typeof parseMemoryExport> | null>(null);

  function add() {
    const r = addItem(items, cat, text);
    if ('error' in r) { setMsg(r.error); return; }
    setItems(r.items); setText(''); setMsg('');
  }

  function analyze() {
    const r = parseMemoryExport(paste, items);
    setPreview(r);
    setMsg(r.items.length ? '' : 'لم أجد عناصر جديدة صالحة في النص');
  }

  function confirmImport() {
    if (!preview) return;
    setItems([...items, ...preview.items].slice(0, MAX_MEMORY_ITEMS));
    setMsg(`أُضيف ${preview.items.length} عنصر ✓`);
    setPreview(null); setPaste('');
  }

  async function copyExport() {
    try { await navigator.clipboard.writeText(exportMemory(items)); setMsg('نُسخ التصدير ✓'); } catch { setMsg('تعذر النسخ'); }
  }

  return (
    <section className="glass mt-4 rounded-3xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-cyan-200">🧠 ذاكرتي ({items.length}/{MAX_MEMORY_ITEMS})</h2>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-cyan-100">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          استخدمها في ردود المحرك
        </label>
      </div>
      <p className="mt-1 text-xs text-cyan-200/50">تُحفظ في متصفحك فقط، وتُرسل مع طلباتك (مضغوطة) إلى الذكاء الاصطناعي حين تكون مفعّلة. لا تضع فيها أسراراً أو أرقاماً حساسة.</p>

      {MEMORY_CATEGORIES.map((c) => {
        const rows = items.filter((i) => i.category === c);
        if (!rows.length) return null;
        return (
          <div key={c} className="mt-3">
            <div className="text-xs font-bold text-cyan-300">{CATEGORY_LABELS[c]}</div>
            <ul className="mt-1 space-y-1">
              {rows.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-2 text-xs text-cyan-100">
                  <span>{i.text}</span>
                  <button type="button" aria-label="حذف" onClick={() => setItems(items.filter((x) => x.id !== i.id))} className="text-rose-300 hover:text-rose-200">✕</button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <div className="mt-3 flex flex-wrap gap-2">
        <select value={cat} onChange={(e) => setCat(e.target.value as MemoryCategory)} aria-label="الفئة" className="rounded-xl border border-cyan-300/20 bg-slate-950/60 p-2 text-xs text-slate-100">
          {MEMORY_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} maxLength={300} placeholder="مثال: أفضّل الردود المختصرة بالعراقية" aria-label="عنصر جديد" className="min-w-0 flex-1 rounded-xl border border-cyan-300/20 bg-slate-950/60 p-2 text-sm text-slate-100" />
        <button type="button" onClick={add} className="rounded-full bg-cyan-300 px-4 py-1.5 text-sm font-black text-slate-950">إضافة</button>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-bold text-cyan-200">⬇️ استيراد من مساعد آخر (ChatGPT, Gemini…)</summary>
        <p className="mt-2 text-xs text-cyan-200/60">اطلب من المساعد الآخر: «Export all of my stored memories…» بالصيغة القياسية، ثم الصق الناتج هنا. تُحذف تلقائياً الأسرار والأرقام الحساسة والروابط وأي نص يوجّه النموذج.</p>
        <textarea value={paste} onChange={(e) => { setPaste(e.target.value); setPreview(null); }} aria-label="تصدير الذاكرة" placeholder="## 1. Instructions&#10;[2025-01-01] - ..." className="mt-2 h-28 w-full rounded-xl border border-cyan-300/20 bg-slate-950/60 p-2 text-sm text-slate-100" dir="auto" />
        <button type="button" onClick={analyze} disabled={!paste.trim()} className="mt-2 rounded-full border border-cyan-300/40 px-4 py-1 text-xs font-bold text-cyan-100 disabled:opacity-40">تحليل ومعاينة</button>
        {preview && preview.items.length > 0 && (
          <div className="mt-2 rounded-2xl border border-cyan-300/20 p-3">
            <div className="text-xs text-cyan-100">سيُضاف {preview.items.length} عنصر. تخطّيتُ: {preview.skipped.secrets} حساس، {preview.skipped.injection} يشبه أوامر، {preview.skipped.duplicates} مكرر.</div>
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-cyan-100/80">
              {preview.items.map((i) => <li key={i.id}><b>{CATEGORY_LABELS[i.category]}:</b> {i.text}</li>)}
            </ul>
            <button type="button" onClick={confirmImport} className="mt-2 rounded-full bg-cyan-300 px-4 py-1.5 text-sm font-black text-slate-950">تأكيد الإضافة</button>
          </div>
        )}
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {items.length > 0 && (
          <>
            <button type="button" onClick={() => void copyExport()} className="rounded-full border border-cyan-300/30 px-3 py-1 text-xs font-bold text-cyan-200 hover:border-cyan-300">⬆️ نسخ تصدير الذاكرة</button>
            <button type="button" onClick={() => { if (confirm('مسح كل الذاكرة؟')) setItems([]); }} className="rounded-full border border-rose-300/40 px-3 py-1 text-xs font-bold text-rose-300 hover:border-rose-300">🗑️ مسح الكل</button>
          </>
        )}
        {msg && <span className="text-xs text-cyan-100/80">{msg}</span>}
      </div>
    </section>
  );
});
export default MemoryPanel;
