import { NextResponse } from 'next/server';
import { fetchGithubSkills, parseGithubUrl } from '@/lib/github-skills';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// يجلب مهارات (نصوص تعليمات فقط) من مستودع GitHub عام. المضيفات ثابتة: github.com / api.github.com / raw.githubusercontent.com
export async function POST(request: Request) {
  const rl = checkRateLimit(`gh:${clientIp(request)}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: `طلبات كثيرة، حاول بعد ${rl.retryAfterSec} ثانية` }, { status: 429 });
  }
  let body: { url?: unknown };
  try {
    body = (await request.json()) as { url?: unknown };
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
  }
  const ref = typeof body.url === 'string' && body.url.length <= 300 ? parseGithubUrl(body.url) : null;
  if (!ref) {
    return NextResponse.json({ error: 'رابط GitHub غير صالح. مثال: https://github.com/المالك/المستودع أو المالك/المستودع' }, { status: 400 });
  }
  const r = await fetchGithubSkills(ref);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 422 });
  return NextResponse.json(r);
}
