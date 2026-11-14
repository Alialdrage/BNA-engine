import { NextResponse } from 'next/server';
import {
  MAX_INPUT_LENGTH, callsPaidApi, engineName, isEngineId, resolveEngine,
  providerAvailableFor, cleanStyle, sanitizeHistory, streamEngine, usesWebSearch,
} from '@/lib/bna-engine';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const DEFAULT_AI_LIMIT_PER_MINUTE = 10;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'الطلب غير صالح' }, { status: 400 });
  }

  const { engine, input, history, stream, style } = (
    typeof body === 'object' && body !== null ? body : {}
  ) as Record<string, unknown>;

  if (!isEngineId(engine)) {
    return NextResponse.json({ error: 'محرك غير معروف' }, { status: 400 });
  }
  if (typeof input !== 'string' || input.trim() === '') {
    return NextResponse.json({ error: 'اكتب نصاً للتحليل' }, { status: 400 });
  }
  if (input.length > MAX_INPUT_LENGTH) {
    return NextResponse.json(
      { error: `النص طويل جداً (الحد ${MAX_INPUT_LENGTH} حرف)` },
      { status: 400 },
    );
  }

  const text = input.trim();
  const target = resolveEngine(engine, text);

  // حد الطلبات يطبق فقط على المحركات التي تستدعي واجهة ذكاء اصطناعي مدفوعة (Claude أو Gemini)
  if (callsPaidApi(target, text)) {
    const limit = Number(process.env.AI_RATE_LIMIT_PER_MINUTE) || DEFAULT_AI_LIMIT_PER_MINUTE;
    const rl = checkRateLimit(`ai:${clientIp(request)}`, limit, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `طلبات كثيرة، حاول بعد ${rl.retryAfterSec} ثانية` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }
  }

  // البحث في الويب مكلف (لكل عملية بحث سعر)، فله حد ساعي إضافي
  if (usesWebSearch(target) && providerAvailableFor(target)) {
    const perHour = Number(process.env.WEB_RATE_LIMIT_PER_HOUR) || 20;
    const rl = checkRateLimit(`web:${clientIp(request)}`, perHour, 3_600_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `وصلت حد البحث في الويب، حاول بعد ${Math.ceil(rl.retryAfterSec / 60)} دقيقة` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }
  }

  const label = engine === 'AUTO' ? `تلقائي ← ${engineName(target)}` : engineName(target);
  const gen = streamEngine(target, text, sanitizeHistory(history), cleanStyle(style));

  // ننتظر أول قطعة قبل الرد، فإن فشلت الخدمة نرجع رمز خطأ حقيقياً بدل رد 200 فارغ
  let first: IteratorResult<string>;
  try {
    first = await gen.next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'حدث خطأ أثناء التحليل';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (stream !== true) {
    let out = first.done ? '' : first.value;
    try {
      for await (const chunk of gen) out += chunk;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'حدث خطأ أثناء التحليل';
      return NextResponse.json({ error: message }, { status: 502 });
    }
    return NextResponse.json({ result: out.trim(), engine: label });
  }

  const encoder = new TextEncoder();
  const body$ = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done) controller.enqueue(encoder.encode(first.value));
        for await (const chunk of gen) controller.enqueue(encoder.encode(chunk));
      } catch {
        controller.enqueue(encoder.encode('\n\n⚠️ انقطع الرد قبل أن يكتمل'));
      }
      controller.close();
    },
    async cancel() {
      await gen.return(undefined);
    },
  });

  return new Response(body$, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      'X-BNA-Engine': encodeURIComponent(label),
    },
  });
}
