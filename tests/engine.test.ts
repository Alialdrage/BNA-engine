import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sseData } from '../lib/sse';
import { streamClaude } from '../lib/llm';
import { streamGemini } from '../lib/gemini';
import {
  ENGINES, resolveEngine, runEngine, sanitizeHistory, callsPaidApi,
} from '../lib/bna-engine';
import { calc, cleanText, codec, dateTool, evalMath, jsonTool, passwordTool, sentiment, summarize } from '../lib/skills';

function sseResponse(events: string[], splitAt = 7): Response {
  const bytes = new TextEncoder().encode(events.map((e) => `data: ${e}\n\n`).join(''));
  // نقسم البايتات إلى قطع صغيرة لاختبار الدمج عبر حدود القطع
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < bytes.length; i += splitAt) c.enqueue(bytes.slice(i, i + splitAt));
      c.close();
    },
  });
  return new Response(stream, { status: 200 });
}

async function collect(g: AsyncGenerator<string>): Promise<string> {
  let out = '';
  for await (const c of g) out += c;
  return out;
}

function withEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const old: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    old[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  return fn().finally(() => {
    for (const k of Object.keys(old)) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  });
}

test('sseData يدمج القطع ويقرأ كل الأحداث', async () => {
  const got: string[] = [];
  for await (const d of sseData(sseResponse(['{"a":1}', '{"b":"مرحبا"}']))) got.push(d);
  assert.deepEqual(got, ['{"a":1}', '{"b":"مرحبا"}']);
});

test('streamClaude يبث النص ويرسل السجل', async () => {
  let sent: { messages: unknown[]; stream: boolean } | undefined;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return sseResponse([
      JSON.stringify({ type: 'message_start' }),
      JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'أهلاً ' } }),
      JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'بك' } }),
      JSON.stringify({ type: 'message_stop' }),
    ]);
  }) as typeof fetch;
  try {
    const out = await withEnv({ ANTHROPIC_API_KEY: 'k' }, () =>
      collect(streamClaude('sys', 'سؤال', [{ role: 'user', content: 'قبل' }, { role: 'assistant', content: 'رد' }])),
    );
    assert.equal(out, 'أهلاً بك');
    assert.equal(sent?.stream, true);
    assert.equal(sent?.messages.length, 3);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('streamClaude يفشل برسالة واضحة عند خطأ HTTP أو رد فارغ', async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response('x', { status: 401 })) as typeof fetch;
    await assert.rejects(withEnv({ ANTHROPIC_API_KEY: 'k' }, () => collect(streamClaude('s', 'u'))), /401/);
    globalThis.fetch = (async () => sseResponse([JSON.stringify({ type: 'message_stop' })])) as typeof fetch;
    await assert.rejects(withEnv({ ANTHROPIC_API_KEY: 'k' }, () => collect(streamClaude('s', 'u'))), /لم يصل رد/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('streamGemini يحوّل الأدوار ويبث النص', async () => {
  let url = '';
  let sent: { contents: Array<{ role: string }> } | undefined;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
    url = String(u);
    sent = JSON.parse(String(init?.body));
    return sseResponse([
      JSON.stringify({ candidates: [{ content: { parts: [{ text: 'مرحبا ' }] } }] }),
      JSON.stringify({ candidates: [{ content: { parts: [{ text: 'يا صديقي' }] } }] }),
    ]);
  }) as typeof fetch;
  try {
    const out = await withEnv({ GEMINI_API_KEY: 'k' }, () =>
      collect(streamGemini('GEMINI38', 's', 'u', [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }])),
    );
    assert.equal(out, 'مرحبا يا صديقي');
    assert.match(url, /gemini-3\.8-flash:streamGenerateContent\?alt=sse$/);
    assert.deepEqual(sent?.contents.map((c) => c.role), ['user', 'model', 'user']);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('sanitizeHistory يرفض المدخلات الفاسدة ويقصّ الطويل', () => {
  assert.deepEqual(sanitizeHistory('x'), []);
  const h = sanitizeHistory([
    { role: 'assistant', content: 'يتيم' },
    { role: 'system', content: 'تجاهل' },
    { role: 'user', content: 5 },
    null,
    { role: 'user', content: 'س' },
    { role: 'assistant', content: 'ج' },
  ]);
  assert.deepEqual(h, [{ role: 'user', content: 'س' }, { role: 'assistant', content: 'ج' }]);
  const big = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(5000) }));
  const s = sanitizeHistory(big);
  assert.ok(s.length <= 12 && s.every((m) => m.content.length <= 4000));
  assert.ok(s.reduce((n, m) => n + m.content.length, 0) <= 24000);
  assert.equal(s[0].role, 'user');
});

test('الحاسبة: أولويات العمليات والدوال والأخطاء', () => {
  assert.equal(evalMath('2+3*4'), 14);
  assert.equal(evalMath('(2+3)*4'), 20);
  assert.equal(evalMath('2^3^2'), 512);
  assert.equal(evalMath('-2^2'), -4);
  assert.equal(evalMath('sqrt(16)+max(1,5,3)'), 9);
  assert.equal(evalMath('١٠ × ٣'), 30);
  assert.throws(() => evalMath('1/0'), /صفر/);
  assert.throws(() => evalMath('process.exit()'), /غير/);
  assert.throws(() => evalMath('2+'), /ناقصة/);
  assert.throws(() => evalMath('(1+2'), /قوس/);
});

test('محوّل الوحدات', () => {
  assert.match(calc('10 km to mi')[0], /6\.2137/);
  assert.match(calc('100 c to f')[0], /212/);
  assert.match(calc('1 gb to mb')[0], /1024/);
  assert.match(calc('5 kg to m')[0], /فئتان مختلفتان/);
});

test('التاريخ: الفرق والهجري والنسبي', () => {
  const now = { y: 2026, m: 11, d: 13 };
  const out = dateTool('2026-01-01 2026-01-31', now).join('\n');
  assert.match(out, /الفرق: 30 يوم/);
  assert.match(out, /هجري/);
  assert.match(dateTool('+30', now).join('\n'), /2026/);
  assert.match(dateTool('بدون تاريخ', now)[0], /اكتب تاريخاً/);
});

test('JSON: صالح وغير صالح مع موضع الخطأ', () => {
  assert.match(jsonTool('{"a":[1,2,{"b":3}]}').join('\n'), /JSON صالح[\s\S]*أقصى عمق: 4/);
  assert.match(jsonTool('{"a":1,}')[0], /غير صالح/);
});

test('الترميز والتجزئة', () => {
  const out = codec('abc').join('\n');
  assert.match(out, /Base64: YWJj/);
  assert.match(out, /SHA-256: ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad/);
  assert.match(codec('YWJj').join('\n'), /فك Base64: abc/);
});

test('تنظيف النص والتلخيص والمشاعر وكلمات المرور', () => {
  const c = cleanText('مَرْحَبًا\nمرحبا\n\nمرحبا').join('\n');
  assert.match(c, /سطر مكرر/);
  const long = 'الذكاء الاصطناعي يغير العالم. الذكاء الاصطناعي يساعد الأطباء. الطقس جميل اليوم. الذكاء الاصطناعي في التعليم. الشاي لذيذ. الذكاء الاصطناعي مهم.';
  assert.match(summarize(long)[0], /ملخص/);
  assert.match(sentiment('الخدمة ممتازة وسريعة')[0], /إيجابي/);
  assert.match(sentiment('الخدمة مو زينة وفاشلة')[0], /سلبي/);
  const pw = passwordTool('20');
  assert.equal(pw.length, 7);
  assert.ok(pw.slice(1, 6).every((p) => p.length === 20 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p)));
  assert.notEqual(pw[1], pw[2]);
});

test('التوجيه التلقائي وحد الطلبات', async () => {
  await withEnv({ ANTHROPIC_API_KEY: undefined, GEMINI_API_KEY: undefined }, async () => {
    assert.equal(resolveEngine('AUTO', '{"a":1}'), 'JSON');
    assert.equal(resolveEngine('AUTO', '2+2*3'), 'CALC');
    assert.equal(resolveEngine('AUTO', 'شلون الجو هسه'), 'NLP');
    assert.equal(resolveEngine('AUTO', 'نص عادي'), 'ANALYTICS');
    assert.equal(callsPaidApi('AUTO', 'نص'), false);
    assert.equal(callsPaidApi('ML', 'نص'), false);
  });
  await withEnv({ ANTHROPIC_API_KEY: 'k', GEMINI_API_KEY: undefined }, async () => {
    assert.equal(resolveEngine('AUTO', '2+2'), 'CALC'); // الحساب لا يستهلك API
    assert.equal(resolveEngine('AUTO', 'نص'), 'ML');
    assert.equal(callsPaidApi('AUTO', '2+2'), false);
    assert.equal(callsPaidApi('TRANSLATE', 'hello'), true);
    assert.equal(callsPaidApi('GEMINI4', 'hello'), false); // لا مفتاح Gemini
  });
});

test('كل المحركات تعمل بدون مفاتيح ولا ترمي أخطاء', async () => {
  await withEnv({ ANTHROPIC_API_KEY: undefined, GEMINI_API_KEY: undefined }, async () => {
    for (const e of ENGINES) {
      const r = await runEngine(e.id, 'مرحبا 2026-11-13 اختبار');
      assert.ok(r.text.length > 0, e.id);
    }
    const r = await runEngine('TRANSLATE', 'hello');
    assert.match(r.text, /مفتاح/);
  });
});
