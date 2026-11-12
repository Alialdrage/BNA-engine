'use client';

import { useState } from 'react';
import { ENGINES, MAX_INPUT_LENGTH, type EngineId } from '@/lib/bna-engine';

type ApiResponse = { result?: string; error?: string };

export default function BNAEngine() {
  const [input, setInput] = useState('');
  const [engine, setEngine] = useState<EngineId>('AUTO');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canRun = !loading && input.trim().length > 0 && input.length <= MAX_INPUT_LENGTH;

  async function runBNA() {
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

  return (
    <main className="min-h-screen p-4">
      <div className="mx-auto max-w-4xl">
        <header className="py-8 text-center border border-[#00D4FF]/30 rounded-2xl bg-[#00D4FF]/5 backdrop-blur-xl shadow-[0_0_50px_rgba(0,212,255,0.3)]">
          <h1 className="text-5xl font-black text-[#00D4FF] drop-shadow-[0_0_20px_#00D4FF]">
            BNA Engine V3
          </h1>
          <p className="text-[#00D4FF]/80 mt-2">Build • Navigate • Analyze</p>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 mt-6">
          {ENGINES.map((e) => {
            const active = engine === e.id;
            return (
              <button
                key={e.id}
                type="button"
                aria-pressed={active}
                onClick={() => setEngine(e.id)}
                className={`p-3 rounded-xl border transition ${
                  active
                    ? 'bg-[#00D4FF] text-black border-[#00D4FF]'
                    : 'bg-[#00D4FF]/10 border-[#00D4FF]/30 text-[#00D4FF] hover:bg-[#00D4FF]/20'
                }`}
              >
                <div className="text-xl">{e.icon}</div>
                <div className="text-xs mt-1 font-bold">{e.name}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-6 p-4 rounded-2xl bg-[#00D4FF]/5 border border-[#00D4FF]/20">
          <textarea
            aria-label="النص المراد تحليله"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={MAX_INPUT_LENGTH}
            placeholder="اكتب شي..."
            className="w-full h-40 bg-black/50 border border-[#00D4FF]/20 rounded-xl p-4 text-white focus:outline-none focus:border-[#00D4FF]"
          />
          <div className="mt-1 text-left text-xs text-[#00D4FF]/60" dir="ltr">
            {input.length}/{MAX_INPUT_LENGTH}
          </div>
          <button
            type="button"
            onClick={runBNA}
            disabled={!canRun}
            className="w-full mt-4 py-4 bg-[#00D4FF] text-black font-black rounded-xl shadow-[0_0_30px_#00D4FF] disabled:opacity-40 disabled:shadow-none"
          >
            {loading ? 'جاري التحليل...' : 'شغّل BNA 🔵'}
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 p-4 rounded-2xl border border-red-500/40 bg-red-500/10 text-red-300"
          >
            {error}
          </div>
        )}

        {result && (
          <section
            aria-live="polite"
            className="mt-6 p-6 rounded-2xl bg-[#00D4FF]/5 border border-[#00D4FF]/30"
          >
            <div className="text-white whitespace-pre-wrap leading-relaxed">{result}</div>
          </section>
        )}
      </div>
    </main>
  );
}
