'use client';

import { useEffect, useRef, useState } from 'react';
import {
  MAX_CUSTOM_SKILLS, MAX_CUSTOM_SYSTEM, exportPack, importPack, mergeSkills, normalizeSkill,
  type CustomSkill,
} from '@/lib/custom-skills';

type ToolsInfo = { builtin: Array<{ name: string; description: string }>; external: Array<{ name: string; description: string }> };

export default function SkillsPanel({
  skills, setSkills, active, setActive,
}: {
  skills: CustomSkill[];
  setSkills: (s: CustomSkill[]) => void;
  active: string | null;
  setActive: (id: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [system, setSystem] = useState('');
  const [msg, setMsg] = useState('');
  const [tools, setTools] = useState<ToolsInfo | null>(null);
  const [ghUrl, setGhUrl] = useState('');
  const [ghBusy, setGhBusy] = useState(false);
  const [ghFound, setGhFound] = useState<{ source: string; truncated: number; skills: CustomSkill[] } | null>(null);
  const [ghPick, setGhPick] = useState<Set<string>>(new Set());
  const importRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch('/api/tools').then((r) => r.json()).then((d: ToolsInfo) => setTools(d)).catch(() => setTools(null));
  }, []);

  function add() {
    const s = normalizeSkill({ name, icon, system });
    if (!s) { setMsg('اكتب اسماً وتعليمات (10 أحرف على الأقل)'); return; }
    if (skills.length >= MAX_CUSTOM_SKILLS && !skills.some((k) => k.name === s.name)) { setMsg(`الحد ${MAX_CUSTOM_SKILLS} مهارة`); return; }
    setSkills(mergeSkills(skills, [s]));
    setName(''); setIcon(''); setSystem(''); setMsg(`أُضيفت المهارة «${s.name}» ✓`);
  }

  async function fetchGh() {
    if (!ghUrl.trim() || ghBusy) return;
    setGhBusy(true); setMsg(''); setGhFound(null);
    try {
      const res = await fetch('/api/github-skills', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: ghUrl.trim() }) });
      const d = (await res.json()) as { error?: string; skills?: CustomSkill[]; source?: string; truncated?: number };
      if (!res.ok || !d.skills) { setMsg(d.error ?? 'تعذر الجلب'); return; }
      setGhFound({ source: d.source ?? '', truncated: d.truncated ?? 0, skills: d.skills });
      setGhPick(new Set(d.skills.map((k) => k.name)));
    } catch {
      setMsg('تعذر الاتصال بالخادم');
    } finally {
      setGhBusy(false);
    }
  }

  function addGh() {
    if (!ghFound) return;
    const chosen = ghFound.skills.filter((k) => ghPick.has(k.name));
    if (!chosen.length) return;
    setSkills(mergeSkills(skills, chosen));
    setMsg(`أُضيفت ${chosen.length} مهارة من GitHub ✓`);
    setGhFound(null); setGhUrl('');
  }

  async function onImport(f: File | undefined) {
    if (!f) return;
    const r = importPack(await f.text());
    if ('error' in r) { setMsg(r.error); return; }
    setSkills(mergeSkills(skills, r.skills));
    setMsg(`تم دمج ${r.skills.length} مهارة ✓`);
    if (importRef.current) importRef.current.value = '';
  }

  function onExport() {
    const url = URL.createObjectURL(new Blob([exportPack(skills)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'bna-skills.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <section className="glass mt-4 rounded-3xl p-4">
      <h2 className="text-sm font-bold text-cyan-200">🧩 مهاراتي وأدواتي</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {skills.length === 0 && <span className="text-xs text-cyan-200/50">لا مهارات مخصصة بعد. أضف واحدة بالأسفل، أو استورد حزمة.</span>}
        {skills.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1">
            <button
              type="button"
              aria-pressed={active === s.id}
              onClick={() => setActive(active === s.id ? null : s.id)}
              title={`/${s.name}`}
              className={`rounded-full border px-3 py-1 text-xs font-bold ${
                active === s.id ? 'border-cyan-300 bg-cyan-300/25 text-white' : 'border-cyan-300/30 text-cyan-200 hover:border-cyan-300'
              }`}
            >
              {s.icon} {s.name}
            </button>
            <button type="button" aria-label={`حذف ${s.name}`} onClick={() => { setSkills(skills.filter((k) => k.id !== s.id)); if (active === s.id) setActive(null); }} className="text-xs text-rose-300 hover:text-rose-200">✕</button>
          </span>
        ))}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-bold text-cyan-200">➕ إضافة مهارة (اسم + تعليمات)</summary>
        <div className="mt-2 grid gap-2">
          <div className="flex gap-2">
            <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} placeholder="🧩" aria-label="أيقونة" className="w-16 rounded-xl border border-cyan-300/20 bg-slate-950/60 p-2 text-center text-sm text-slate-100" />
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="اسم المهارة، مثل: مسوّق" aria-label="اسم المهارة" className="flex-1 rounded-xl border border-cyan-300/20 bg-slate-950/60 p-2 text-sm text-slate-100" />
          </div>
          <textarea value={system} onChange={(e) => setSystem(e.target.value)} maxLength={MAX_CUSTOM_SYSTEM} placeholder="التعليمات: مثل «أنت خبير تسويق. اكتب نصاً إعلانياً قصيراً بالعراقية مع 3 عناوين مقترحة.»" aria-label="تعليمات المهارة" className="h-24 rounded-xl border border-cyan-300/20 bg-slate-950/60 p-2 text-sm text-slate-100" />
          <button type="button" onClick={add} className="rounded-full bg-cyan-300 px-4 py-1.5 text-sm font-black text-slate-950">حفظ المهارة</button>
        </div>
      </details>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-bold text-cyan-200">🐙 استيراد مهارات من GitHub</summary>
        <div className="mt-2 flex gap-2">
          <input
            value={ghUrl}
            onChange={(e) => setGhUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void fetchGh(); }}
            dir="ltr"
            placeholder="https://github.com/owner/repo  أو  owner/repo"
            aria-label="رابط GitHub"
            className="flex-1 rounded-xl border border-cyan-300/20 bg-slate-950/60 p-2 text-sm text-slate-100"
          />
          <button type="button" onClick={() => void fetchGh()} disabled={ghBusy} className="rounded-full bg-cyan-300 px-4 py-1.5 text-sm font-black text-slate-950 disabled:opacity-50">
            {ghBusy ? '…' : 'جلب'}
          </button>
        </div>
        <p className="mt-1 text-xs text-cyan-200/50">يدعم: مستودع/مجلد فيه ملفات SKILL.md، أو ملف bna-skills.json، أو رابط ملف مباشر. يُستورد نص التعليمات فقط ولا يُنفَّذ أي كود.</p>
        {ghFound && (
          <div className="mt-2 rounded-2xl border border-cyan-300/20 p-3">
            <div className="text-xs text-cyan-200/70" dir="ltr">{ghFound.source}</div>
            <ul className="mt-2 space-y-1">
              {ghFound.skills.map((k) => (
                <li key={k.name}>
                  <label className="flex cursor-pointer items-start gap-2 text-xs text-cyan-100">
                    <input
                      type="checkbox"
                      checked={ghPick.has(k.name)}
                      onChange={(e) => setGhPick((p) => { const n = new Set(p); if (e.target.checked) n.add(k.name); else n.delete(k.name); return n; })}
                    />
                    <span><b>{k.name}</b> — {k.system.slice(0, 90)}…</span>
                  </label>
                </li>
              ))}
            </ul>
            {ghFound.truncated > 0 && <p className="mt-2 text-xs text-amber-200/80">{ghFound.truncated} مهارة اقتُطعت تعليماتها لتناسب الحد ({MAX_CUSTOM_SYSTEM} حرف).</p>}
            <p className="mt-2 text-xs text-amber-200/80">راجع التعليمات قبل الإضافة: ستُرسل إلى الذكاء الاصطناعي مع طلباتك.</p>
            <button type="button" onClick={addGh} className="mt-2 rounded-full bg-cyan-300 px-4 py-1.5 text-sm font-black text-slate-950">إضافة المحدد ({ghPick.size})</button>
          </div>
        )}
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => void onImport(e.target.files?.[0])} />
        <button type="button" onClick={() => importRef.current?.click()} className="rounded-full border border-cyan-300/30 px-3 py-1 text-xs font-bold text-cyan-200 hover:border-cyan-300">⬇️ استيراد حزمة مهارات</button>
        {skills.length > 0 && <button type="button" onClick={onExport} className="rounded-full border border-cyan-300/30 px-3 py-1 text-xs font-bold text-cyan-200 hover:border-cyan-300">⬆️ تصدير مهاراتي</button>}
        {msg && <span className="text-xs text-cyan-100/80">{msg}</span>}
      </div>
      <p className="mt-2 text-xs text-cyan-200/50">المهارات تُحفظ في متصفحك. للتشغيل اختر المهارة أو اكتب /اسمها قبل الطلب. (لا تعمل داخل سلاسل الدمج)</p>

      {tools && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-bold text-cyan-200">
            🔌 أدوات يستدعيها المحرك تلقائياً ({tools.builtin.length + tools.external.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-cyan-100/80">
            {[...tools.builtin, ...tools.external].map((t) => (
              <li key={t.name}><b dir="ltr">{t.name}</b> — {t.description}</li>
            ))}
          </ul>
          {tools.external.length === 0 && (
            <p className="mt-2 text-xs text-cyan-200/50">لإضافة أداة خارجية (API) ضع تعريفها في متغير EXTERNAL_TOOLS في إعدادات Vercel (انظر README).</p>
          )}
        </details>
      )}
    </section>
  );
}
