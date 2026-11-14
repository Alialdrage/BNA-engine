'use client';

import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import BookStudio from '@/components/BookStudio';
import Games from '@/components/Games';
import { streamBnaFull } from '@/lib/client-api';
import { ENGINES, MAX_INPUT_LENGTH, parseSlash, slashSuggestions, type EngineId } from '@/lib/engines';
import { hostOf, linkify } from '@/lib/linkify';
import { prepareFile, type PreparedFile } from '@/lib/client-files';
import { recognitionSupported, speak, startListening, stopSpeaking, ttsSupported } from '@/lib/voice';
import { MAX_STEPS, PRESETS, addStep, nextInput } from '@/lib/pipeline';

type ApiResponse = { result?: string; error?: string };
type Turn = { id: number; engine: string; input: string; output: string };

// يعرض النص، ويحوّل الصور الداخلية إلى صور والروابط (http/https) إلى روابط حيّة تُفتح في تبويب جديد
function Output({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap break-words leading-relaxed text-slate-100">
      {linkify(text).map((p, i) => {
        if (p.t === 'text') return <Fragment key={i}>{p.text}</Fragment>;
        if (p.t === 'image') return <GeneratedImage key={i} alt={p.alt} src={p.src} />;
        const host = hostOf(p.url);
        return (
          <Fragment key={i}>
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="break-all font-bold text-cyan-300 underline decoration-cyan-300/40 underline-offset-4 transition hover:text-white hover:decoration-white"
            >
              {p.label}
            </a>
            {host && p.label !== p.url && !p.label.includes(host) && (
              <span dir="ltr" className="mx-1 inline-block text-xs text-cyan-200/50">
                {host} ↗
              </span>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function GeneratedImage({ alt, src }: { alt: string; src: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'fail'>('loading');
  return (
    <span className="my-3 block">
      {state === 'loading' && <span className="block text-sm text-cyan-200/70">⏳ جاري توليد الصورة (قد تستغرق نصف دقيقة)…</span>}
      {state === 'fail' && (
        <span className="block text-sm text-rose-300">تعذر توليد الصورة الآن، جرّب وصفاً آخر أو حاول لاحقاً.</span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onLoad={() => setState('ok')}
        onError={() => setState('fail')}
        className={`max-h-[70vh] rounded-2xl border border-cyan-300/30 ${state === 'ok' ? '' : 'hidden'}`}
      />
      {state === 'ok' && (
        <a href={src} download="bna-image" className="mt-2 inline-block text-xs font-bold text-cyan-300 hover:underline">
          تحميل الصورة
        </a>
      )}
    </span>
  );
}

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
  const [tab, setTab] = useState<'engines' | 'games' | 'books'>('engines');
  const [engine, setEngine] = useState<EngineId>('AUTO');
  const [menuOpen, setMenuOpen] = useState(false); // الأدوات والمهارات مخفية افتراضياً
  const [style, setStyle] = useState('');
  const [files, setFiles] = useState<PreparedFile[]>([]);
  const [listening, setListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [voiceOk, setVoiceOk] = useState({ mic: false, tts: false });
  const stopListenRef = useRef<(() => void) | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [chainMode, setChainMode] = useState(false);
  const [chain, setChain] = useState<EngineId[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [live, setLive] = useState<{ engine: string; input: string; output: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setTurns(loadTurns());
    setVoiceOk({ mic: recognitionSupported(), tts: ttsSupported() });
    return () => stopSpeaking();
    try { setStyle(localStorage.getItem('bna-style-v1') ?? ''); } catch { /* غير متاح */ }
  }, []);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setError('');
    for (const f of Array.from(list)) {
      if (files.length + 1 > 3) { setError('الحد الأقصى 3 مرفقات'); break; }
      try {
        const pf = await prepareFile(f);
        setFiles((prev) => (prev.length < 3 ? [...prev, pf] : prev));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذر قراءة الملف');
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  function toggleMic() {
    if (listening) { stopListenRef.current?.(); return; }
    const base = input ? `${input.trimEnd()} ` : '';
    setListening(true);
    setError('');
    try {
      stopListenRef.current = startListening(
        (text) => setInput((base + text).slice(0, MAX_INPUT_LENGTH)),
        (err) => { setListening(false); if (err) setError(err); },
      );
    } catch {
      setListening(false);
      setError('الإملاء الصوتي غير مدعوم في هذا المتصفح (جرّب Chrome)');
    }
  }

  function toggleSpeak(t: Turn) {
    if (speakingId === t.id) { stopSpeaking(); setSpeakingId(null); return; }
    setSpeakingId(t.id);
    speak(t.output, () => setSpeakingId(null));
  }

  function saveStyle(v: string) {
    setStyle(v);
    try { localStorage.setItem('bna-style-v1', v); } catch { /* غير متاح */ }
  }

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

  // عند إخفاء القائمة نعمل بالوضع التلقائي دائماً، فلا تؤثر اختيارات مخفية على الطلب
  const effEngine: EngineId = menuOpen ? engine : 'AUTO';
  const effChain = menuOpen && chainMode;
  const suggestions = slashSuggestions(input);
  const canRun =
    !loading && (input.trim().length > 0 || files.length > 0) && input.length <= MAX_INPUT_LENGTH && (!effChain || chain.length >= 2);
  const nearLimit = input.length > MAX_INPUT_LENGTH * 0.9;

  async function runBNA() {
    if (!canRun) return;
    const slash = parseSlash(input);
    if (slash && !slash.text) {
      setError('اكتب طلبك بعد اسم المهارة، مثل: /صور قطة تلبس نظارات');
      return;
    }
    const typed = slash ? slash.text : input.trim();
    const textBlocks = files.filter((f) => f.text !== undefined).map((f) => `\n\n--- ملف: ${f.name} ---\n${f.text}`).join('');
    const atts = files.flatMap((f) => (f.att ? [f.att] : []));
    const base = typed || (files.length ? (atts.length ? 'صف هذا المرفق ولخّصه' : 'لخّص هذا الملف') : '');
    const text = (base + textBlocks).slice(0, MAX_INPUT_LENGTH);
    const shown = files.length ? `${typed} 📎 ${files.map((f) => f.name).join('، ')}`.trim() : text;
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
    setLive({ engine: '', input: shown, output: '' });
    let label = '';
    let output = '';
    try {
      const res = await fetch('/api/bna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: slash?.engine ?? effEngine, input: text, history, stream: true, style, attachments: atts }),
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
        setLive({ engine: label, input: shown, output });
      }
      output += decoder.decode();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError('تعذر الاتصال بالخادم، حاول مرة أخرى');
      }
    } finally {
      if (output.trim()) {
        const turn: Turn = { id: Date.now(), engine: label, input: shown, output: output.trim() };
        setTurns((prev) => {
          const next = [turn, ...prev].slice(0, MAX_TURNS);
          persist(next);
          return next;
        });
        setInput('');
        setFiles([]);
      }
      setLive(null);
      setLoading(false);
      abortRef.current = null;
    }
  }

  // دمج المهارات: ناتج كل خطوة يصبح مدخل التي بعدها
  async function runChain() {
    if (!canRun) return;
    const startInput = input.trim();
    const steps = [...chain];
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError('');
    let current = startInput;
    try {
      for (let i = 0; i < steps.length; i++) {
        const tag = `الخطوة ${i + 1}/${steps.length}`;
        const shownInput = i === 0 ? startInput : '↳ ناتج الخطوة السابقة';
        setLive({ engine: tag, input: shownInput, output: '' });
        const { text, label } = await streamBnaFull(steps[i], current, {
          signal: ctrl.signal,
          style,
          onChunk: (full) => setLive({ engine: tag, input: shownInput, output: full }),
        });
        if (!text.trim()) throw new Error(`${tag}: لم يصل ناتج`);
        const turn: Turn = { id: Date.now() + i, engine: `${i + 1}/${steps.length} · ${label}`, input: shownInput, output: text.trim() };
        setTurns((prev) => {
          const next = [turn, ...prev].slice(0, MAX_TURNS);
          persist(next);
          return next;
        });
        current = nextInput(text);
        if (!current && i < steps.length - 1) throw new Error(`${tag}: الناتج فارغ، توقفت السلسلة`);
      }
      setInput('');
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'تعذر تنفيذ السلسلة');
      }
    } finally {
      setLive(null);
      setLoading(false);
      abortRef.current = null;
    }
  }

  const run = () => void (effChain ? runChain() : runBNA());

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
      run();
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

        <div className="mt-4 flex justify-center">
          <button
            type="button"
            aria-expanded={menuOpen}
            onClick={() => {
              if (menuOpen) setTab('engines');
              setMenuOpen((v) => !v);
            }}
            className="rounded-full border border-cyan-300/25 px-4 py-1.5 text-xs font-bold text-cyan-200/80 transition hover:border-cyan-300 hover:text-white"
          >
            {menuOpen ? '✕ إخفاء الأدوات' : '☰ الأدوات والمهارات'}
          </button>
        </div>

        {menuOpen && (
        <nav className="mt-4 flex justify-center gap-2" aria-label="الأقسام">
          {([['engines', '⚡ المحركات'], ['books', '📖 الكتب'], ['games', '🎮 الألعاب']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-full border px-5 py-2 text-sm font-bold transition ${
                tab === id
                  ? 'border-cyan-300/70 bg-gradient-to-r from-cyan-300 to-indigo-400 text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.5)]'
                  : 'glass text-cyan-200'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        )}

        {tab === 'games' ? (
          <Games />
        ) : tab === 'books' ? (
          <BookStudio />
        ) : (
          <>

        {menuOpen && (
          <>
        <section className="glass mt-6 rounded-3xl p-4">
          <details className="mb-3">
            <summary className="cursor-pointer text-sm font-bold text-cyan-200">✍️ أسلوبي في الكتابة (يُطبَّق على الكتابة والتحرير)</summary>
            <textarea
              aria-label="وصف أسلوبي"
              value={style}
              maxLength={1500}
              onChange={(e) => saveStyle(e.target.value)}
              placeholder="مثال: نبرة ودية، جمل قصيرة، فصحى مبسطة، أتجنب المبالغة، أحب الأمثلة العراقية. ألصق هنا فقرة من كتابتك ليحاكيها."
              className="mt-2 h-24 w-full rounded-xl border border-cyan-300/20 bg-slate-950/60 p-3 text-sm text-slate-100"
            />
            <p className="mt-1 text-xs text-cyan-200/60">يُحفظ في متصفحك فقط، ويُرسل مع طلبات الكتابة ({style.length}/1500).</p>
          </details>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              aria-pressed={chainMode}
              onClick={() => setChainMode((v) => !v)}
              className={`rounded-full border px-4 py-1.5 text-sm font-bold transition ${
                chainMode ? 'border-cyan-300 bg-cyan-300/20 text-white' : 'border-cyan-300/30 text-cyan-200 hover:border-cyan-300'
              }`}
            >
              🔗 دمج المهارات {chainMode ? '(مفعّل)' : ''}
            </button>
            {chainMode && (
              <select
                aria-label="سلاسل جاهزة"
                className="rounded-xl border border-cyan-300/20 bg-slate-950/60 px-3 py-1.5 text-sm text-slate-100"
                value=""
                onChange={(e) => {
                  const p = PRESETS.find((x) => x.id === e.target.value);
                  if (p) setChain(p.steps);
                }}
              >
                <option value="">سلاسل جاهزة…</option>
                {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
          {chainMode ? (
            <div className="mt-3">
              <p className="text-xs text-cyan-200/70">
                اضغط على المهارات بالترتيب (حتى {MAX_STEPS})، وناتج كل واحدة يدخل التي بعدها. تحتاج خطوتين على الأقل.
              </p>
              <ol className="mt-2 flex flex-wrap items-center gap-2" aria-label="خطوات السلسلة">
                {chain.length === 0 && <li className="text-sm text-cyan-200/50">لم تختر شيئاً بعد</li>}
                {chain.map((id, i) => {
                  const e = ENGINES.find((x) => x.id === id)!;
                  return (
                    <li key={`${id}-${i}`} className="flex items-center gap-1">
                      {i > 0 && <span className="text-cyan-300">←</span>}
                      <button
                        type="button"
                        title="إزالة الخطوة"
                        onClick={() => setChain((c) => c.filter((_, j) => j !== i))}
                        className="rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100 hover:border-rose-300 hover:text-rose-200"
                      >
                        {i + 1}. {e.icon} {e.name} ✕
                      </button>
                    </li>
                  );
                })}
                {chain.length > 0 && (
                  <li><button type="button" onClick={() => setChain([])} className="text-xs text-rose-300 hover:underline">مسح</button></li>
                )}
              </ol>
            </div>
          ) : (
            <p className="mt-2 text-xs text-cyan-200/60">فعّل الدمج لتوصيل عدة مهارات: مثلاً ابحث ← لخّص ← ترجم.</p>
          )}
        </section>

        {(['ai', 'local'] as const).map((group) => (
          <div key={group} className="mt-6">
            <h2 className="mb-2 text-xs font-bold tracking-wider text-cyan-200/70">
              {group === 'ai' ? 'ذكاء اصطناعي (يحتاج مفتاحاً)' : 'مهارات محلية (بدون مفتاح)'}
            </h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8">
              {ENGINES.filter((e) => e.group === group).map((e) => {
                const active = chainMode ? chain.includes(e.id) : engine === e.id;
                return (
                  <button
                    key={e.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => (chainMode ? setChain((c) => addStep(c, e.id)) : setEngine(e.id))}
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

          </>
        )}

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
            placeholder="اكتب طلبك هنا… (اكتب / لاختيار مهارة، مثل /صور أو /ترجمة)"
            className="h-40 w-full rounded-2xl border border-cyan-300/20 bg-slate-950/60 p-4 text-slate-100 outline-none transition duration-300 placeholder:text-cyan-200/40 focus:border-cyan-300 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.25),0_0_30px_rgba(34,211,238,0.35)]"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept="image/*,application/pdf,text/*,.md,.csv,.json,.py,.js,.ts,.tsx,.html,.css,.sql,.log"
              onChange={(e) => void addFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={loading || files.length >= 3}
              className="rounded-full border border-cyan-300/30 px-3 py-1 text-xs font-bold text-cyan-200 hover:border-cyan-300 disabled:opacity-40"
            >
              📎 صورة / PDF / ملف
            </button>
            {voiceOk.mic && (
              <button
                type="button"
                onClick={toggleMic}
                aria-pressed={listening}
                className={`rounded-full border px-3 py-1 text-xs font-bold ${
                  listening ? 'border-rose-300 bg-rose-500/20 text-rose-100' : 'border-cyan-300/30 text-cyan-200 hover:border-cyan-300'
                }`}
              >
                {listening ? '⏹ إيقاف الإملاء' : '🎤 إملاء بالصوت'}
              </button>
            )}
            {files.map((f) => (
              <span key={f.id} className="inline-flex items-center gap-1 rounded-full bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
                {f.att?.mime.startsWith('image/') ? '🖼️' : '📄'} {f.name}
                <button type="button" aria-label="إزالة المرفق" onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))} className="hover:text-rose-300">✕</button>
              </span>
            ))}
          </div>

          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2" role="listbox" aria-label="مهارات مقترحة">
              {suggestions.map((sg) => (
                <button
                  key={sg.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => setInput(`/${sg.name} `)}
                  className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100 hover:border-cyan-300"
                >
                  {sg.icon} {sg.name}
                </button>
              ))}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-cyan-200/50">Ctrl + Enter للتشغيل</span>
            <span dir="ltr" className={nearLimit ? 'text-amber-300' : 'text-cyan-200/60'}>
              {input.length}/{MAX_INPUT_LENGTH}
            </span>
          </div>

          <button
            type="button"
            onClick={run}
            disabled={!canRun}
            aria-busy={loading}
            className={`mt-4 w-full rounded-2xl py-4 font-black text-slate-950 transition duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:hover:scale-100 ${
              loading
                ? 'btn-loading'
                : 'bg-gradient-to-r from-cyan-300 via-sky-400 to-indigo-500 shadow-[0_0_30px_rgba(34,211,238,0.5)] hover:shadow-[0_0_50px_rgba(34,211,238,0.8)] disabled:shadow-none'
            } ${!canRun && !loading ? 'opacity-40' : ''}`}
          >
            {loading ? 'جاري الرد...' : effChain ? `شغّل السلسلة (${chain.length}) 🔗` : 'شغّل BNA 🔵'}
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
            {live.output ? <Output text={live.output} /> : <span className="text-cyan-200/60">…</span>}
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
                {voiceOk.tts && (
                  <button type="button" onClick={() => toggleSpeak(t)} className="font-bold text-cyan-300 hover:underline">
                    {speakingId === t.id ? '⏹ إيقاف' : '🔊 استماع'}
                  </button>
                )}
                <button type="button" onClick={() => copy(t)} className="font-bold text-cyan-300 hover:underline">
                  {copied === t.id ? 'تم النسخ ✓' : 'نسخ'}
                </button>
              </span>
            </div>
            <Output text={t.output} />
          </section>
        ))}
          </>
        )}
      </div>
    </main>
  );
}
