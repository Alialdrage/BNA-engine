import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamClaude } from '../lib/llm';
import { streamGemini } from '../lib/gemini';
import { runEngine, callsPaidApi, usesWebSearch } from '../lib/bna-engine';
import { formatSources, safeUrl } from '../lib/sources';

function sse(events: unknown[]): Response {
  const bytes = new TextEncoder().encode(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''));
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < bytes.length; i += 11) c.enqueue(bytes.slice(i, i + 11));
      c.close();
    },
  });
  return new Response(stream, { status: 200 });
}
const collect = async (g: AsyncGenerator<string>) => {
  let o = '';
  for await (const c of g) o += c;
  return o;
};
async function withKey<T>(env: Record<string, string | undefined>, fn: () => Promise<T>) {
  const old: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    old[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(old)) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  }
}

test('safeUrl يقبل http/https فقط', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,x'), null);
  assert.equal(safeUrl('not a url'), null);
  assert.ok(safeUrl('https://example.com/a?b=1'));
});

test('Claude: أداة البحث تُرسل والمصادر المستشهد بها تُعرض مع الاستعلامات', async () => {
  let body: { tools?: Array<{ type: string; name: string; max_uses: number }>; max_tokens: number } | undefined;
  const real = globalThis.fetch;
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return sse([
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_start', index: 1, content_block: { type: 'server_tool_use', id: 's', name: 'web_search' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"query":"سعر ' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: 'الذهب"}' } },
      { type: 'content_block_stop', index: 1 },
      {
        type: 'content_block_start', index: 2,
        content_block: {
          type: 'web_search_tool_result',
          content: [
            { type: 'web_search_result', url: 'https://a.example/1', title: 'مصدر أ' },
            { type: 'web_search_result', url: 'javascript:evil()', title: 'سيئ' },
            { type: 'web_search_result', url: 'https://b.example/2', title: 'مصدر ب' },
          ],
        },
      },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'السعر كذا' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'citations_delta', citation: { url: 'https://b.example/2', title: 'مصدر ب' } } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    ]);
  }) as typeof fetch;
  try {
    const out = await withKey({ ANTHROPIC_API_KEY: 'k' }, () =>
      collect(streamClaude('s', 'سعر الذهب', [], { webSearchMaxUses: 3, maxTokens: 999 })),
    );
    assert.equal(body?.tools?.[0].type, 'web_search_20250305');
    assert.equal(body?.tools?.[0].max_uses, 3);
    assert.equal(body?.max_tokens, 999);
    assert.match(out, /^السعر كذا/);
    assert.match(out, /استعلامات البحث: سعر الذهب/);
    assert.match(out, /1\. \[مصدر ب\]\(https:\/\/b\.example\/2\)/);
    assert.doesNotMatch(out, /مصدر أ|javascript/); // نعرض المستشهد به فقط
  } finally {
    globalThis.fetch = real;
  }
});

test('Claude: بدون استشهاد نعرض نتائج البحث الآمنة، وبدون بحث لا مصادر ولا أدوات', async () => {
  const real = globalThis.fetch;
  let sentTools: unknown = 'unset';
  try {
    globalThis.fetch = (async () =>
      sse([
        { type: 'content_block_start', index: 1, content_block: { type: 'web_search_tool_result', content: [{ url: 'https://c.example', title: 'ج' }] } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'نص' } },
      ])) as typeof fetch;
    const out = await withKey({ ANTHROPIC_API_KEY: 'k' }, () => collect(streamClaude('s', 'u', [], { webSearchMaxUses: 2 })));
    assert.match(out, /1\. \[ج\]\(https:\/\/c\.example\/\)/);

    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
      sentTools = (JSON.parse(String(init?.body)) as { tools?: unknown }).tools;
      return sse([{ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'نص' } }]);
    }) as typeof fetch;
    const plain = await withKey({ ANTHROPIC_API_KEY: 'k' }, () => collect(streamClaude('s', 'u')));
    assert.equal(plain, 'نص');
    assert.equal(sentTools, undefined);
  } finally {
    globalThis.fetch = real;
  }
});

test('Claude: خطأ أداة البحث (content ككائن) لا يكسر البث', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async () =>
    sse([
      { type: 'content_block_start', index: 1, content_block: { type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'رد' } },
      { type: 'message_delta', delta: { stop_reason: 'pause_turn' } },
    ])) as typeof fetch;
  try {
    const out = await withKey({ ANTHROPIC_API_KEY: 'k' }, () => collect(streamClaude('s', 'u', [], { webSearchMaxUses: 1 })));
    assert.match(out, /^رد/);
    assert.match(out, /لم تُرجع الخدمة مصادر|توقف البحث/);
  } finally {
    globalThis.fetch = real;
  }
});

test('Gemini: google_search ومصادر التأريض', async () => {
  let body: { tools?: unknown } | undefined;
  const real = globalThis.fetch;
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return sse([
      { candidates: [{ content: { parts: [{ text: 'جواب' }] } }] },
      {
        candidates: [{
          content: { parts: [{ text: ' نهائي' }] },
          groundingMetadata: {
            webSearchQueries: ['q1'],
            groundingChunks: [{ web: { uri: 'https://g.example/x', title: 'g.example' } }, { web: { uri: 'ftp://bad', title: 'x' } }],
          },
        }],
      },
    ]);
  }) as typeof fetch;
  try {
    const out = await withKey({ GEMINI_API_KEY: 'k' }, () => collect(streamGemini('GEMINI38', 's', 'u', [], { webSearchMaxUses: 3 })));
    assert.deepEqual(body?.tools, [{ google_search: {} }]);
    assert.match(out, /^جواب نهائي/);
    assert.match(out, /استعلامات البحث: q1/);
    assert.match(out, /1\. \[g\.example\]\(https:\/\/g\.example\/x\)/);
    assert.doesNotMatch(out, /ftp/);
  } finally {
    globalThis.fetch = real;
  }
});

test('formatSources: بلا شيء يرجع نصاً فارغاً', () => {
  assert.equal(formatSources([], []), '');
});

test('المحركات الجديدة: بدون مفتاح تعطي بدائل مفيدة، ولها حد خاص', async () => {
  await withKey({ ANTHROPIC_API_KEY: undefined, GEMINI_API_KEY: undefined }, async () => {
    const w = await runEngine('WEBSEARCH', 'أخبار الذكاء الاصطناعي اليوم');
    assert.match(w.text, /google\.com\/search\?q=/);
    const d = await runEngine('DEEPANALYSIS', 'هل أنتقل لوظيفة جديدة؟');
    assert.match(d.text, /التحليل العميق يحتاج/);
    assert.equal(callsPaidApi('DEEPRESEARCH', 'x'), false);
  });
  await withKey({ ANTHROPIC_API_KEY: 'k', GEMINI_API_KEY: undefined }, async () => {
    assert.equal(callsPaidApi('DEEPRESEARCH', 'x'), true);
    assert.equal(usesWebSearch('DEEPRESEARCH'), true);
    assert.equal(usesWebSearch('DEEPANALYSIS'), false);
  });
});

test('التأليف والكتابة البحثية: تسجيل المحركات وحدود الاستهلاك والبدائل', async () => {
  await withKey({ ANTHROPIC_API_KEY: undefined, GEMINI_API_KEY: undefined }, async () => {
    const a = await runEngine('AUTHOR', 'اكتب قصة قصيرة عن بغداد');
    assert.match(a.text, /مفتاح/);
    const w = await runEngine('RESEARCHWRITER', 'مقال عن الطاقة الشمسية في العراق');
    assert.match(w.text, /google\.com\/search\?q=/);
  });
  await withKey({ ANTHROPIC_API_KEY: 'k', GEMINI_API_KEY: undefined }, async () => {
    assert.equal(usesWebSearch('RESEARCHWRITER'), true);
    assert.equal(usesWebSearch('AUTHOR'), false);
    assert.equal(callsPaidApi('AUTHOR', 'x'), true);
  });
});
