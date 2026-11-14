import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamClaude } from '../lib/llm';
import { runTool, TOOLS } from '../lib/tools';
import { sanitizeAttachments } from '../lib/attachments';
import { speakable } from '../lib/voice';
import { runEngine } from '../lib/bna-engine';

function sse(events: unknown[]): Response {
  const bytes = new TextEncoder().encode(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''));
  return new Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } }), { status: 200 });
}
const collect = async (g: AsyncGenerator<string>) => { let o = ''; for await (const c of g) o += c; return o; };

test('الأدوات المحلية', async () => {
  assert.match(await runTool('calculate', { input: '2+2*3' }), /8/);
  assert.equal(await runTool('nope', { input: 'x' }), 'أداة غير معروفة');
  assert.equal(await runTool('calculate', {}), 'مدخل فارغ');
  assert.ok(TOOLS.every((t) => t.name && t.input_schema));
});

test('Claude: حلقة الأدوات ترسل النتيجة وتكمل الرد', async () => {
  const bodies: Array<{ messages: Array<{ role: string; content: unknown }>; tools?: unknown[] }> = [];
  const real = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = 'k';
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    if (bodies.length === 1) {
      return sse([
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'سأحسب. ' } },
        { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu_1', name: 'calculate' } },
        { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"input":"2400*15/1' } },
        { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '00"}' } },
        { type: 'content_block_stop', index: 1 },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
      ]);
    }
    return sse([
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'النتيجة 360' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    ]);
  }) as typeof fetch;
  try {
    const out = await collect(streamClaude('sys', 'كم 15% من 2400', [], { tools: true }));
    assert.match(out, /النتيجة 360/);
    assert.match(out, /calculate/);
    assert.equal(bodies.length, 2);
    assert.ok(bodies[0].tools && bodies[0].tools.length === TOOLS.length);
    const last = bodies[1].messages.at(-1)!;
    assert.equal(last.role, 'user');
    const tr = (last.content as Array<{ type: string; tool_use_id: string; content: string }>)[0];
    assert.equal(tr.type, 'tool_result');
    assert.equal(tr.tool_use_id, 'tu_1');
    assert.match(tr.content, /360/);
    const asst = bodies[1].messages.at(-2)!;
    assert.equal(asst.role, 'assistant');
  } finally {
    globalThis.fetch = real;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test('Claude: الصور وPDF تُرسل ككتل صحيحة', async () => {
  let body: { messages: Array<{ content: Array<{ type: string; source?: { media_type: string } }> }> } | undefined;
  const real = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = 'k';
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return sse([
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    ]);
  }) as typeof fetch;
  try {
    const r = await runEngine('VISION', 'ما هذا؟', [], '', [
      { mime: 'image/jpeg', data: 'QUJD' },
      { mime: 'application/pdf', data: 'QUJD' },
    ]);
    assert.equal(r.text.startsWith('ok'), true);
    const c = body!.messages.at(-1)!.content;
    assert.deepEqual(c.map((b) => b.type), ['image', 'document', 'text']);
    assert.equal(c[1].source?.media_type, 'application/pdf');
  } finally {
    globalThis.fetch = real;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test('التحقق من المرفقات', () => {
  assert.deepEqual(sanitizeAttachments(undefined), []);
  assert.ok(Array.isArray(sanitizeAttachments([{ mime: 'image/png', data: 'QUJD' }])));
  for (const bad of [
    [{ mime: 'text/html', data: 'QUJD' }],
    [{ mime: 'image/png', data: '<script>' }],
    [{ mime: 'image/png', data: '' }],
    Array.from({ length: 4 }, () => ({ mime: 'image/png', data: 'QUJD' })),
    'x',
  ]) assert.ok('error' in (sanitizeAttachments(bad) as object), JSON.stringify(bad).slice(0, 40));
});

test('رؤية بلا مفتاح تعطي رسالة واضحة، والنطق يزيل الروابط والكود', async () => {
  const r = await runEngine('VISION', 'صف', [], '', [{ mime: 'image/png', data: 'QUJD' }]);
  assert.match(r.text, /مفتاح/);
  const s = speakable('نص [رابط](https://x.com) ![صورة](/api/image?p=1) ```js\ncode\n``` **غامق**\n\n🔧 أدوات: calculate');
  assert.ok(!/https|api\/image|code|\*|calculate/.test(s), s);
});
