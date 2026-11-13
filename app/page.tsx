'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { ENGINES, MAX_INPUT_LENGTH, type EngineId } from '@/lib/engines';

type ApiResponse = { result?: string; error?: string };
type Turn = { id: number; engine: string; input: string; output: string };

const STORAGE_KEY = 'bna-chat-v1';
const MAX_TURNS = 30;
const HISTORY_TURNS = 6;
// مخرجات لا نحفظها في المتصفح لأنها حساسة
const NO_PERSIST = /كلمات مرور/;

function loadTurns(): Turn[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(data) ? (data as Turn[]).filter((t) => typeof t?.output === 'string') : [];
  } catch {
    return [];
  }
}

// يمرر موقع المؤشر إلى العنصر، فتتحرك الإضاءة خلفه
function trackPointer(e: MouseEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--x', `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty('--y', `${e.clientY - rect.top}px`);
}

export default function BNAEngine() {
  const [input, setInput] = useState('');
  const [engine, setEngine] = useState<EngineId>('AUTO');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [live, setLive] = useState<{ engine: string; input: string; output: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setTurns(loadTurns());
  }, []);

  function persist(next: Turn[]) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(next.filter((t) => !NO_PERSIST.test(t.output)).slice(0, MAX_TURNS)),
      );
    } catch {
      /* التخزين غير متاح */
    }
  }

  const canRun = !loading && input.trim().length > 0 && input.length <= MAX_INPUT_LENGTH;
  const nearLimit = input.length > MAX_INPUT_LENGTH * 0.9;

  async function runBNA() {
    if (!canRun) return;
    const text = input.trim();
    // آخر المحادثات ترسل للخادم كذاكرة (تُستخدم لمحركات الذكاء الاصطناعي فقط)
    const history = turns
      .slice(0, HISTORY_TURNS)
      .reverse()
      .flatMap((t) => [
        { role: 'user', content: t.input },
        { role: 'assistant', content: t.output },
      ]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError('');
    setLive({ engine: '', input: text, output: '' });
    let label = '';
    let output = '';
    try {
      const res = await fetch('/api/bna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine, input: text, history, stream: true }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as ApiResponse;
        setError(data.error ?? 'تعذر تنفيذ التحليل');
        setLive(null);
        return;
      }
      label = decodeURIComponent(res.headers.get('X-BNA-Engine') ?? '');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        output += decoder.decode(value, { stream: true });
        setLive({ engine: label, input: text, output });
      }
      output += decoder.decode();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError('تعذر الاتصال بالخادم، حاول مرة أخرى');
      }
    } finally {
      if (output.trim()) {
        const turn: Turn = { id: Date.now(), engine: label, input: text, output: output.trim() };
        setTurns((prev) => {
          const next = [turn, ...prev].slice(0, MAX_TURNS);
          persist(next);
          return next;
        });
        setInput('');
      }
      setLive(null);
      setLoading(false);
      abortRef.current = null;
    }
  }

  function clearChat() {
    setTurns([]);
    persist([]);
  }

  async function copy(t: Turn) {
    try {
      await navigator.clipboard.writeText(t.output);
      setCopied(t.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* النسخ غير متاح */
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

        {(['ai', 'local'] as const).map((group) => (
          <div key={group} className="mt-6">
            <h2 className="mb-2 text-xs font-bold tracking-wider text-cyan-200/70">
              {group === 'ai' ? 'ذكاء اصطناعي (يحتاج مفتاحاً)' : 'مهارات محلية (بدون مفتاح)'}
            </h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8">
              {ENGINES.filter((e) => e.group === group).map((e) => {
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
          </div>
        ))}

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
            {loading ? 'جاري الرد...' : 'شغّل BNA 🔵'}
          </button>
          {loading && (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="mt-3 w-full rounded-2xl border border-rose-400/40 py-2 text-sm font-bold text-rose-200 transition hover:bg-rose-500/10"
            >
              إيقاف
            </button>
          )}
        </section>

        {error && (
          <div
            role="alert"
            className="fade-up mt-6 rounded-3xl border border-rose-400/40 bg-rose-500/10 p-4 text-rose-200 shadow-[0_0_30px_rgba(244,63,94,0.25)]"
          >
            {error}
          </div>
        )}

        {(live || turns.length > 0) && (
          <div className="mt-6 flex items-center justify-between text-xs text-cyan-200/60">
            <span>المحادثة ({turns.length}) — تُحفظ في متصفحك فقط وتُستخدم كذاكرة للذكاء الاصطناعي</span>
            {turns.length > 0 && !loading && (
              <button type="button" onClick={clearChat} className="font-bold text-rose-300 hover:underline">
                مسح المحادثة
              </button>
            )}
          </div>
        )}

        {live && (
          <section aria-live="polite" className="glass fade-up mt-3 rounded-3xl p-6">
            <div className="mb-2 text-xs text-cyan-200/60">أنت: {live.input.slice(0, 120)}</div>
            <div className="whitespace-pre-wrap leading-relaxed text-slate-100">
              {live.output || <span className="text-cyan-200/60">…</span>}
            </div>
          </section>
        )}

        {turns.map((t) => (
          <section
            key={t.id}
            onMouseMove={trackPointer}
            className="glass spotlight fade-up mt-3 rounded-3xl p-6"
          >
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-cyan-200/60">أنت: {t.input.slice(0, 120)}</span>
              <span className="flex shrink-0 items-center gap-3">
                {t.engine && <span className="rounded-full bg-cyan-300/10 px-2 py-0.5 text-cyan-200">{t.engine}</span>}
                <button type="button" onClick={() => copy(t)} className="font-bold text-cyan-300 hover:underline">
                  {copied === t.id ? 'تم النسخ ✓' : 'نسخ'}
                </button>
              </span>
            </div>
            <div className="whitespace-pre-wrap leading-relaxed text-slate-100">{t.output}</div>
          </section>
        ))}
      </div>
    </main>
  );
}
