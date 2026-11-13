// منطق الألعاب (دوال نقية قابلة للاختبار).

export type Cell = 'X' | 'O' | null;
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6],
];

export function xoWinner(b: Cell[]): { winner: 'X' | 'O' | null; line: number[] | null } {
  for (const l of LINES) {
    const [a, c, d] = l;
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { winner: b[a], line: l };
  }
  return { winner: null, line: null };
}

export function xoFull(b: Cell[]): boolean {
  return b.every(Boolean);
}

function minimax(b: Cell[], turn: 'X' | 'O', ai: 'X' | 'O', depth: number): number {
  const { winner } = xoWinner(b);
  if (winner) return winner === ai ? 10 - depth : depth - 10;
  if (xoFull(b)) return 0;
  let best = turn === ai ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = turn;
    const score = minimax(b, turn === 'X' ? 'O' : 'X', ai, depth + 1);
    b[i] = null;
    best = turn === ai ? Math.max(best, score) : Math.min(best, score);
  }
  return best;
}

// الحركة المثلى (لا يمكن هزيمتها). في الوضع السهل: عشوائية في بعض الأحيان.
export function xoAiMove(board: Cell[], ai: 'X' | 'O', hard: boolean, rng: () => number = Math.random): number {
  const free = board.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
  if (free.length === 0) return -1;
  if (!hard && rng() < 0.5) return free[Math.floor(rng() * free.length)];
  let bestI = free[0];
  let bestScore = -Infinity;
  for (const i of free) {
    const b = board.slice();
    b[i] = ai;
    const score = minimax(b, ai === 'X' ? 'O' : 'X', ai, 1);
    if (score > bestScore) {
      bestScore = score;
      bestI = i;
    }
  }
  return bestI;
}

export type MemoryCard = { id: number; symbol: string };

export function memoryDeck(symbols: string[], rng: () => number = Math.random): MemoryCard[] {
  const cards = [...symbols, ...symbols].map((symbol, id) => ({ id, symbol }));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export type Hint = 'high' | 'low' | 'win';
export function guessHint(secret: number, guess: number): Hint {
  return guess === secret ? 'win' : guess < secret ? 'high' : 'low';
}

export type Rps = 'rock' | 'paper' | 'scissors';
const BEATS: Record<Rps, Rps> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
export function rpsResult(me: Rps, cpu: Rps): 'win' | 'lose' | 'draw' {
  if (me === cpu) return 'draw';
  return BEATS[me] === cpu ? 'win' : 'lose';
}
