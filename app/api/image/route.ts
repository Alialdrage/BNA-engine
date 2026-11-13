import { NextResponse } from 'next/server';
import { MAX_IMAGE_BYTES, parseImageParams, upstreamUrl } from '@/lib/image';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_IMAGE_LIMIT_PER_MINUTE = 12;

export async function GET(request: Request) {
  const params = parseImageParams(new URL(request.url).searchParams);
  if ('error' in params) {
    return NextResponse.json({ error: params.error }, { status: 400 });
  }

  const limit = Number(process.env.IMAGE_RATE_LIMIT_PER_MINUTE) || DEFAULT_IMAGE_LIMIT_PER_MINUTE;
  const rl = checkRateLimit(`img:${clientIp(request)}`, limit, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `طلبات كثيرة، حاول بعد ${rl.retryAfterSec} ثانية` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl(params), { signal: AbortSignal.timeout(60_000) });
  } catch {
    return NextResponse.json({ error: 'تعذر الوصول لخدمة الصور، أو انتهت المهلة' }, { status: 502 });
  }

  const type = upstream.headers.get('content-type') ?? '';
  if (!upstream.ok || !/^image\/(png|jpe?g|webp)/i.test(type)) {
    return NextResponse.json({ error: `خدمة الصور رجعت خطأ (${upstream.status})` }, { status: 502 });
  }
  const buf = await upstream.arrayBuffer();
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'الصورة كبيرة جداً' }, { status: 502 });
  }
  return new Response(buf, {
    headers: {
      'Content-Type': type.split(';')[0],
      'Cache-Control': 'public, max-age=86400, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
