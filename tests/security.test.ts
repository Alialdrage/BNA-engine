import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cvss31, cvssTool, hashId, headerCheck, jwtDecode, logScan } from '../lib/security';
import { resolveEngine, runEngine } from '../lib/bna-engine';
import { ENGINES } from '../lib/engines';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

test('CVSS 3.1: قيم مرجعية معروفة', () => {
  assert.deepEqual(cvss31('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'), { score: 9.8, severity: 'Critical' });
  assert.equal(cvss31('CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N')?.score, 6.1); // XSS كلاسيكي
  assert.equal(cvss31('CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H')?.score, 7.8);
  assert.equal(cvss31('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N')?.score, 0);
  assert.equal(cvss31('CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'), null);
  assert.equal(cvss31('garbage'), null);
  assert.match(cvssTool('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')[0], /9\.8.*Critical/);
});

test('JWT: يفك ويكشف alg=none وانتهاء الصلاحية', () => {
  const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: '1', exp: 1 })}.`;
  const out = jwtDecode(none).join('\n');
  assert.match(out, /alg=none/);
  assert.match(out, /منتهي/);
  const ok = `${b64({ alg: 'RS256' })}.${b64({ sub: '1', exp: Math.floor(Date.now() / 1000) + 3600, iss: 'a', aud: 'b' })}.sig`;
  assert.match(jwtDecode(ok).join('\n'), /✅ RS256/);
  assert.match(jwtDecode('abc')[0], /الصيغة/);
  assert.match(jwtDecode(`${b64({ alg: 'HS256' })}.${b64({ password: 'x' })}.s`).join('\n'), /حساسة/);
});

test('تعريف الهاش لا يكسر ويحذّر من الدوال السريعة', () => {
  assert.match(hashId('5d41402abc4b2a76b9719d911017c592').join('\n'), /MD5/);
  assert.match(hashId('5d41402abc4b2a76b9719d911017c592').join('\n'), /Argon2id/);
  assert.match(hashId('$2b$12$' + 'a'.repeat(53)).join('\n'), /bcrypt/);
  assert.match(hashId('hello world')[0], /لا يطابق/);
});

test('ترويسات أمنية: ناقصة مقابل جيدة', () => {
  const bad = headerCheck('Server: nginx/1.18.0\nX-Powered-By: Express\nSet-Cookie: sid=1; Path=/');
  assert.match(bad.join('\n'), /Content-Security-Policy غير موجود/);
  assert.match(bad.join('\n'), /الكوكي sid ينقصه/);
  const score = (a: string[]) => Number(/(\d+)\/100/.exec(a[0])![1]);
  const good = headerCheck(
    [
      'Strict-Transport-Security: max-age=31536000; includeSubDomains',
      "Content-Security-Policy: default-src 'self'; frame-ancestors 'none'",
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: no-referrer',
      'Set-Cookie: sid=1; Secure; HttpOnly; SameSite=Lax',
    ].join('\n'),
  );
  assert.ok(score(good) > score(bad) && score(good) >= 95, good.join('|'));
});

test('فرز السجلات يكشف الأنماط والتخمين', () => {
  const lines = [
    '1.2.3.4 - - "GET /index.php?id=1 UNION SELECT 1,2" 200',
    '1.2.3.4 - - "GET /../../etc/passwd" 404',
    '5.6.7.8 - - "GET /.env" 404 "sqlmap/1.7"',
    ...Array.from({ length: 6 }, () => 'sshd: Failed password for root from 9.9.9.9 port 22'),
  ].join('\n');
  const out = logScan(lines).join('\n');
  assert.match(out, /حقن SQL/);
  assert.match(out, /اجتياز مسارات/);
  assert.match(out, /أداة فحص آلية/);
  assert.match(out, /تخمين كلمات مرور: 9\.9\.9\.9 \(6\)/);
  assert.match(logScan('GET / 200 ok')[1], /لا مؤشرات/);
});

test('التوجيه التلقائي والمحركات الجديدة', async () => {
  const jwt = `${b64({ alg: 'none' })}.${b64({ a: 1 })}.`;
  assert.equal(resolveEngine('AUTO', jwt), 'JWTDECODE');
  assert.equal(resolveEngine('AUTO', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'), 'CVSS');
  assert.equal(resolveEngine('AUTO', '5d41402abc4b2a76b9719d911017c592'), 'HASHID');
  assert.equal(resolveEngine('AUTO', 'اشرح لي اختبار اختراق لموقعي'), 'PENTEST');
  assert.equal(resolveEngine('AUTO', 'كيف احمي شركتي من الأمن السيبراني التهديدات'), 'SECADVISOR');
  for (const id of ['SECADVISOR', 'SECREVIEW', 'THREAT', 'PENTEST', 'JWTDECODE', 'HASHID', 'SECHEADERS', 'LOGSCAN', 'CVSS']) {
    assert.ok(ENGINES.some((e) => e.id === id), id);
  }
  const r = await runEngine('CVSS', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H');
  assert.match(r.text, /9\.8/);
});

test('محرك الاختراق الأخلاقي يحمل قيود التفويض والرفض في تعليماته', async () => {
  let sys = '';
  const real = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = 'k';
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    sys = JSON.parse(String(init?.body)).system;
    const bytes = new TextEncoder().encode(
      [
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      ].map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''),
    );
    return new Response(new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }));
  }) as typeof fetch;
  try {
    await runEngine('PENTEST', 'ما هي منهجية اختبار تطبيق ويب؟');
    assert.match(sys, /تفويض/);
    assert.match(sys, /ترفض/);
    assert.match(sys, /برمجيات خبيثة/);
  } finally {
    globalThis.fetch = real;
    delete process.env.ANTHROPIC_API_KEY;
  }
});
