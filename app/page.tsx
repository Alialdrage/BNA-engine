'use client';

import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { ENGINES, MAX_INPUT_LENGTH, type EngineId } from '@/lib/bna-engine';

type ApiResponse = { result?: string; error?: string };

// يمرر موقع المؤشر إلى العنصر، فتتحرك الإضاءة خلفه
function trackPointer(e: MouseEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--x', `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty('--y', `${e.clientY - rect.top}px`);
}

export default function BNAEngine() {
  const [input, setInput] = useState('');
  const [engine, setEngine] = useState<EngineId>('AUTO');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canRun = !loading && input.trim().length > 0 && input.length <= MAX_INPUT_LENGTH;
  const nearLimit = input.length > MAX_INPUT_LENGTH * 0.9;

  async function runBNA() {
    if (!canRun) return;
    setLoading(true);
    setError('');
    setResult('');
    try {
      const res = await fetch('/api/bna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine, input: input.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok || !data.result) {
        setError(data.error ?? 'تعذر تنفيذ التحليل');
        return;
      }
      setResult(data.result);
    } catch {
      setError('تعذر الاتصال بالخادم، حاول مرة أخرى');
    } finally {
      setLoading(false);
    }
  }

  // Ctrl/⌘ + Enter لتشغيل التحليل بسرعة
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void runBNA();
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden p-4 sm:p-6">
      {/* كرات ضوئية نيلية وسماوية في الخلفية */}
      <div aria-hidden className="orb -left-24 top-0 -z-10 h-80 w-80 bg-indigo-600/40" />
      <div
        aria-hidden
        className="orb -right-24 top-1/3 -z-10 h-96 w-96 bg-cyan-400/25"
        style={{ animationDelay: '-4s' }}
      />
      <div
        aria-hidden
        className="orb bottom-0 left-1/3 -z-10 h-80 w-80 bg-sky-500/20"
        style={{ animationDelay: '-8s' }}
      />

      <div className="relative mx-auto max-w-4xl">
        <header
          onMouseMove={trackPointer}
          className="glass spotlight fade-up rounded-3xl py-10 text-center"
        >
          <h1 className="neon-text text-5xl font-black sm:text-6xl">BNA Engine V3</h1>
          <p className="mt-3 text-sm tracking-[0.3em] text-cyan-200/80">
            BUILD • NAVIGATE • ANALYZE
          </p>
        </header>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-9">
          {ENGINES.map((e) => {
            const active = engine === e.id;
            return (
              <button
                key={e.id}
                type="button"
                aria-pressed={active}
                onClick={() => setEngine(e.id)}
                onMouseMove={trackPointer}
                className={`spotlight group rounded-2xl border p-3 transition duration-300 hover:-translate-y-1 active:scale-95 ${
                  active
                    ? 'border-cyan-300/70 bg-gradient-to-br from-cyan-300 via-sky-400 to-indigo-500 text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.6)]'
                    : 'glass text-cyan-200 hover:shadow-[0_0_25px_rgba(34,211,238,0.35)]'
                }`}
              >
                <div className="text-2xl transition duration-300 group-hover:scale-110">
                  {e.icon}
                </div>
                <div className="mt-1 text-xs font-bold">{e.name}</div>
              </button>
            );
          })}
        </div>

        <section
          onMouseMove={trackPointer}
          className="glass spotlight mt-6 rounded-3xl p-5 transition duration-300 focus-within:shadow-[0_0_50px_rgba(34,211,238,0.3)]"
        >
          <textarea
            aria-label="النص المراد تحليله"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={MAX_INPUT_LENGTH}
            placeholder="اكتب شي..."
            className="h-40 w-full rounded-2xl border border-cyan-300/20 bg-slate-950/60 p-4 text-slate-100 outline-none transition duration-300 placeholder:text-cyan-200/40 focus:border-cyan-300 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.25),0_0_30px_rgba(34,211,238,0.35)]"
          />

          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-cyan-200/50">Ctrl + Enter للتشغيل</span>
            <span dir="ltr" className={nearLimit ? 'text-amber-300' : 'text-cyan-200/60'}>
              {input.length}/{MAX_INPUT_LENGTH}
            </span>
          </div>

          <button
            type="button"
            onClick={runBNA}
            disabled={!canRun}
            aria-busy={loading}
            className={`mt-4 w-full rounded-2xl py-4 font-black text-slate-950 transition duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:hover:scale-100 ${
              loading
                ? 'btn-loading'
                : 'bg-gradient-to-r from-cyan-300 via-sky-400 to-indigo-500 shadow-[0_0_30px_rgba(34,211,238,0.5)] hover:shadow-[0_0_50px_rgba(34,211,238,0.8)] disabled:shadow-none'
            } ${!canRun && !loading ? 'opacity-40' : ''}`}
          >
            {loading ? 'جاري التحليل...' : 'شغّل BNA 🔵'}
          </button>
        </section>

        {error && (
          <div
            role="alert"
            className="fade-up mt-6 rounded-3xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-200 shadow-[0_0_30px_rgba(244,63,94,0.25)]"
          >
            {error}
          </div>
        )}

        {result && (
          <section
            aria-live="polite"
            onMouseMove={trackPointer}
            className="glass spotlight fade-up mt-6 rounded-3xl p-6"
          >
            <div className="whitespace-pre-wrap leading-relaxed text-slate-100">{result}</div>
          </section>
        )}
      </div>
    </main>
  );
}
