'use client';

import { useEffect, useRef, useState } from 'react';
import {
  guessHint, memoryDeck, rpsResult, xoAiMove, xoFull, xoWinner,
  type Cell, type MemoryCard, type Rps,
} from '@/lib/games';

const btn =
  'rounded-xl border border-cyan-300/30 bg-slate-950/50 px-4 py-2 text-sm font-bold text-cyan-100 transition hover:border-cyan-300 hover:shadow-[0_0_20px_rgba(34,211,238,0.35)] active:scale-95';
const panel = 'glass rounded-3xl p-5';

// ---------- إكس أو ضد الحاسوب ----------
function TicTacToe() {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [hard, setHard] = useState(true);
  const [score, setScore] = useState({ me: 0, cpu: 0, draw: 0 });
  const { winner, line } = xoWinner(board);
  const over = Boolean(winner) || xoFull(board);
  const counted = useRef(false);

  useEffect(() => {
    if (!over) {
      counted.current = false;
      return;
    }
    if (counted.current) return;
    counted.current = true;
    setScore((s) => (winner === 'X' ? { ...s, me: s.me + 1 } : winner === 'O' ? { ...s, cpu: s.cpu + 1 } : { ...s, draw: s.draw + 1 }));
  }, [over, winner]);

  function play(i: number) {
    if (board[i] || over) return;
    const b = board.slice();
    b[i] = 'X';
    if (!xoWinner(b).winner && !xoFull(b)) {
      const m = xoAiMove(b, 'O', hard);
      if (m >= 0) b[m] = 'O';
    }
    setBoard(b);
  }

  return (
    <section className={panel}>
      <h3 className="mb-3 font-black text-cyan-200">❌⭕ إكس أو</h3>
      <div dir="ltr" className="mx-auto grid w-56 grid-cols-3 gap-2">
        {board.map((c, i) => (
          <button
            key={i}
            type="button"
            aria-label={`خانة ${i + 1}`}
            onClick={() => play(i)}
            className={`h-16 rounded-xl border text-3xl font-black transition ${
              line?.includes(i)
                ? 'border-cyan-300 bg-cyan-300/30 text-white'
                : 'border-cyan-300/20 bg-slate-950/50 text-cyan-200 hover:border-cyan-300/60'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="mt-3 text-center text-sm text-slate-200">
        {winner === 'X' ? 'فزت! 🎉' : winner === 'O' ? 'فاز الحاسوب 🤖' : over ? 'تعادل 🤝' : 'دورك (X)'}
      </p>
      <p className="text-center text-xs text-cyan-200/70">أنت {score.me} — الحاسوب {score.cpu} — تعادل {score.draw}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <button type="button" className={btn} onClick={() => setBoard(Array(9).fill(null))}>جولة جديدة</button>
        <button type="button" className={btn} onClick={() => setHard((h) => !h)}>
          المستوى: {hard ? 'صعب (لا يُهزم)' : 'سهل'}
        </button>
      </div>
    </section>
  );
}

// ---------- لعبة الذاكرة ----------
const SYMBOLS = ['🐪', '🌴', '☕', '🕌', '🍉', '⚽', '🎲', '🚀'];

function Memory() {
  const [cards, setCards] = useState<MemoryCard[]>([]);
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const lock = useRef(false);

  useEffect(() => {
    setCards(memoryDeck(SYMBOLS));
  }, []);

  function flip(idx: number) {
    if (lock.current || open.includes(idx) || matched.has(idx)) return;
    const next = [...open, idx];
    setOpen(next);
    if (next.length === 2) {
      setMoves((m) => m + 1);
      lock.current = true;
      const [a, b] = next;
      if (cards[a].symbol === cards[b].symbol) {
        setMatched((m) => new Set([...m, a, b]));
        setOpen([]);
        lock.current = false;
      } else {
        setTimeout(() => {
          setOpen([]);
          lock.current = false;
        }, 800);
      }
    }
  }

  function reset() {
    setCards(memoryDeck(SYMBOLS));
    setOpen([]);
    setMatched(new Set());
    setMoves(0);
    lock.current = false;
  }

  const won = cards.length > 0 && matched.size === cards.length;
  return (
    <section className={panel}>
      <h3 className="mb-3 font-black text-cyan-200">🧠 لعبة الذاكرة</h3>
      <div dir="ltr" className="mx-auto grid w-64 grid-cols-4 gap-2">
        {cards.map((c, i) => {
          const shown = open.includes(i) || matched.has(i);
          return (
            <button
              key={c.id}
              type="button"
              aria-label={shown ? c.symbol : 'بطاقة مقلوبة'}
              onClick={() => flip(i)}
              className={`h-14 rounded-xl border text-2xl transition ${
                shown ? 'border-cyan-300 bg-cyan-300/20' : 'border-cyan-300/20 bg-indigo-900/60 hover:border-cyan-300/60'
              }`}
            >
              {shown ? c.symbol : '❔'}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-3 text-center text-sm text-slate-200">
        {won ? `أحسنت! أنهيتها بـ ${moves} محاولة 🎉` : `المحاولات: ${moves}`}
      </p>
      <div className="mt-3 text-center"><button type="button" className={btn} onClick={reset}>لعبة جديدة</button></div>
    </section>
  );
}

// ---------- خمّن الرقم ----------
const newSecret = () => 1 + Math.floor(Math.random() * 100);

function Guess() {
  const [secret, setSecret] = useState(newSecret);
  const [value, setValue] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [won, setWon] = useState(false);

  function submit() {
    const g = Number(value);
    if (!Number.isInteger(g) || g < 1 || g > 100 || won) return;
    const h = guessHint(secret, g);
    setLog((l) => [`${g}: ${h === 'win' ? 'صح! 🎉' : h === 'high' ? 'أكبر ⬆️' : 'أصغر ⬇️'}`, ...l].slice(0, 8));
    if (h === 'win') setWon(true);
    setValue('');
  }

  return (
    <section className={panel}>
      <h3 className="mb-3 font-black text-cyan-200">🔢 خمّن الرقم (1 إلى 100)</h3>
      <div className="flex gap-2">
        <input
          aria-label="تخمينك"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 3))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="min-w-0 flex-1 rounded-xl border border-cyan-300/20 bg-slate-950/60 px-3 py-2 text-slate-100 outline-none focus:border-cyan-300"
        />
        <button type="button" className={btn} onClick={submit}>خمّن</button>
      </div>
      <ul className="mt-3 space-y-1 text-sm text-slate-200">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <div className="mt-3">
        <button type="button" className={btn} onClick={() => { setSecret(newSecret()); setLog([]); setWon(false); }}>
          رقم جديد
        </button>
      </div>
    </section>
  );
}

// ---------- حجر ورقة مقص ----------
const RPS: Array<{ id: Rps; icon: string; name: string }> = [
  { id: 'rock', icon: '🪨', name: 'حجر' },
  { id: 'paper', icon: '📄', name: 'ورقة' },
  { id: 'scissors', icon: '✂️', name: 'مقص' },
];

function RockPaperScissors() {
  const [last, setLast] = useState<{ me: Rps; cpu: Rps; r: 'win' | 'lose' | 'draw' } | null>(null);
  const [score, setScore] = useState({ win: 0, lose: 0, draw: 0 });

  function play(me: Rps) {
    const cpu = RPS[Math.floor(Math.random() * 3)].id;
    const r = rpsResult(me, cpu);
    setLast({ me, cpu, r });
    setScore((s) => ({ ...s, [r]: s[r] + 1 }));
  }
  const icon = (id: Rps) => RPS.find((x) => x.id === id)!.icon;

  return (
    <section className={panel}>
      <h3 className="mb-3 font-black text-cyan-200">✂️ حجر ورقة مقص</h3>
      <div className="flex justify-center gap-2">
        {RPS.map((x) => (
          <button key={x.id} type="button" className={btn} onClick={() => play(x.id)}>
            {x.icon} {x.name}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="mt-3 text-center text-sm text-slate-200">
        {last
          ? `${icon(last.me)} ضد ${icon(last.cpu)} — ${last.r === 'win' ? 'فزت 🎉' : last.r === 'lose' ? 'خسرت 😅' : 'تعادل 🤝'}`
          : 'اختر حركتك'}
      </p>
      <p className="text-center text-xs text-cyan-200/70">فوز {score.win} — خسارة {score.lose} — تعادل {score.draw}</p>
    </section>
  );
}

export default function Games() {
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <TicTacToe />
      <Memory />
      <Guess />
      <RockPaperScissors />
    </div>
  );
}
