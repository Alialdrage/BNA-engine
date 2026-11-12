import { NextResponse } from 'next/server';
import { MAX_INPUT_LENGTH, callsPaidApi, isEngineId, runEngine } from '@/lib/bna-engine';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const DEFAULT_AI_LIMIT_PER_MINUTE = 10;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'الطلب غير صالح' }, { status: 400 });
  }

  const { engine, input } = (
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

  // حد الطلبات يطبق فقط على المحركات التي تستدعي واجهة ذكاء اصطناعي مدفوعة (Claude أو Gemini)
  if (callsPaidApi(engine)) {
    const limit = Number(process.env.AI_RATE_LIMIT_PER_MINUTE) || DEFAULT_AI_LIMIT_PER_MINUTE;
    const rl = checkRateLimit(`ai:${clientIp(request)}`, limit, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `طلبات كثيرة، حاول بعد ${rl.retryAfterSec} ثانية` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }
  }

  try {
    const result = await runEngine(engine, input);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'حدث خطأ أثناء التحليل';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
