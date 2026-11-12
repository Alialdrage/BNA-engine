import { NextResponse } from 'next/server';
import { MAX_INPUT_LENGTH, isEngineId, runEngine } from '@/lib/bna-engine';

export const runtime = 'nodejs';

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

  try {
    const result = await runEngine(engine, input);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'حدث خطأ أثناء التحليل';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
