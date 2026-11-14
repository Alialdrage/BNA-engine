import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessHint, memoryDeck, rpsResult, xoAiMove, xoWinner, type Cell } from '../lib/games';
import { localImageUrl, parseImageParams, sizeFromText, upstreamUrl } from '../lib/image';
import { runEngine, callsPaidApi } from '../lib/bna-engine';

test('إكس أو: الحاسوب الصعب لا يخسر أبداً ضد كل اللعب العشوائي', () => {
  let rng = 12345;
  const rand = () => ((rng = (rng * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let game = 0; game < 300; game++) {
    const b: Cell[] = Array(9).fill(null);
    let turn: 'X' | 'O' = game % 2 ? 'O' : 'X'; // يبدأ أحياناً الإنسان وأحياناً الحاسوب
    while (!xoWinner(b).winner && b.some((c) => !c)) {
      if (turn === 'X') {
        const free = b.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
        b[free[Math.floor(rand() * free.length)]] = 'X';
      } else {
        b[xoAiMove(b, 'O', true, rand)] = 'O';
      }
      turn = turn === 'X' ? 'O' : 'X';
    }
    assert.notEqual(xoWinner(b).winner, 'X', `خسر في اللعبة ${game}`);
  }
});

test('إكس أو: يكمل الفوز ويصد التهديد', () => {
  const win: Cell[] = ['O', 'O', null, 'X', 'X', null, null, null, null];
  assert.equal(xoAiMove(win, 'O', true), 2);
  const block: Cell[] = ['X', 'X', null, null, 'O', null, null, null, null];
  assert.equal(xoAiMove(block, 'O', true), 2);
});

test('الذاكرة والتخمين وحجر ورقة مقص', () => {
  const d = memoryDeck(['a', 'b', 'c']);
  assert.equal(d.length, 6);
  assert.deepEqual(d.map((c) => c.symbol).sort(), ['a', 'a', 'b', 'b', 'c', 'c']);
  assert.equal(new Set(d.map((c) => c.id)).size, 6);
  assert.equal(guessHint(50, 50), 'win');
  assert.equal(guessHint(50, 10), 'high');
  assert.equal(guessHint(50, 90), 'low');
  assert.equal(rpsResult('rock', 'scissors'), 'win');
  assert.equal(rpsResult('rock', 'paper'), 'lose');
  assert.equal(rpsResult('paper', 'paper'), 'draw');
});

test('معاملات الصورة: تحقق وقصّ وقيم افتراضية', () => {
  assert.deepEqual(parseImageParams(new URLSearchParams('')), { error: 'اكتب وصف الصورة' });
  assert.ok('error' in parseImageParams(new URLSearchParams({ prompt: 'x'.repeat(501) })));
  const p = parseImageParams(new URLSearchParams('prompt=cat&w=99999&h=10&seed=-5&model=evil'));
  assert.ok(!('error' in p));
  if (!('error' in p)) {
    assert.equal(p.width, 768);
    assert.equal(p.height, 256);
    assert.equal(p.seed, 5);
    assert.equal(p.model, 'flux');
  }
});

test('رابط الصورة: ترميز آمن لا يخرج من المسار', () => {
  const url = upstreamUrl({ prompt: 'a/b?c=d#e (x)', width: 512, height: 512, seed: 1, model: 'flux' });
  assert.ok(url.startsWith('https://image.pollinations.ai/prompt/a%2Fb%3Fc%3Dd%23e%20(x)?'));
  const local = localImageUrl({ prompt: 'قطة (جميلة)', width: 512, height: 512, seed: 1 });
  assert.ok(!/[()\s]/.test(local));
  assert.deepEqual(sizeFromText('صورة عمودي'), { width: 576, height: 768 });
});

test('محرك الصور يعمل بدون مفتاح ويرجع رابطاً داخلياً فقط', async () => {
  const old = [process.env.ANTHROPIC_API_KEY, process.env.GEMINI_API_KEY];
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const r = await runEngine('IMAGE', 'قطة تلبس نظارات');
    assert.match(r.text, /!\[[^\]]*\]\(\/api\/image\?prompt=/);
    assert.equal(callsPaidApi('IMAGE', 'قطة'), false);
    const v = await runEngine('VIDEO', 'فيديو عن بغداد');
    assert.match(v.text, /مفتاح/);
  } finally {
    if (old[0]) process.env.ANTHROPIC_API_KEY = old[0];
    if (old[1]) process.env.GEMINI_API_KEY = old[1];
  }
});
