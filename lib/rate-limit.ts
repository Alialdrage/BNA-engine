// حد بسيط لعدد الطلبات لكل عنوان IP (نافذة زمنية ثابتة).
// يُخزَّن في ذاكرة الخادم: يعمل على خادم واحد. لبيئات متعددة الخوادم استخدم Redis أو ما شابه.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10000;
// تنظيف دوري: كل دقيقة نزيل الـbuckets المنتهية بدل الانتظار لبلوغ الحد الأقصى
let lastPrune = 0;
const PRUNE_INTERVAL = 60_000;

function pruneExpired(now: number) {
  const shouldPrune = buckets.size >= MAX_BUCKETS || now - lastPrune > PRUNE_INTERVAL;
  if (!shouldPrune) return;
  lastPrune = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = { ok: boolean; retryAfterSec: number };

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  pruneExpired(now);

  // حد صفر أو سالب = منع كلي
  if (limit <= 0) {
    return { ok: false, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

// نستخدم آخر IP عام في سلسلة X-Forwarded-For لمنع انتحال العناوين الخاصة.
// Vercel يُضيف IP العميل الحقيقي في نهاية السلسلة، فالأخير هو المعتمد.
function isPublicIp(ip: string): boolean {
  // نقبل أي IP ليس خاصاً صريحاً (فحص بسيط للأكثر شيوعاً)
  if (!ip || ip === 'unknown') return false;
  const parts = ip.split('.');
  if (parts.length !== 4) return true; // IPv6 نقبله كما هو
  const [a, b] = parts.map(Number);
  return !(
    a === 10 || a === 127 || a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
    // نأخذ آخر IP عام في السلسلة (Vercel يُدرجه في النهاية)
    const pub = [...ips].reverse().find(isPublicIp);
    if (pub) return pub;
    // احتياطي: أول IP في القائمة حتى لو خاص
    if (ips[0]) return ips[0];
  }
  return request.headers.get('x-real-ip') ?? 'unknown';
}
