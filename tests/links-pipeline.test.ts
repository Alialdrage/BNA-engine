import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostOf, linkify } from '../lib/linkify';
import { MAX_STEPS, PRESETS, addStep, nextInput } from '../lib/pipeline';
import { addSource, formatSources, stripSources } from '../lib/sources';
import { ENGINES, MAX_INPUT_LENGTH } from '../lib/engines';

test('linkify: رابط markdown وروابط مجردة وصور داخلية', () => {
  const p = linkify('انظر [مصدر أ](https://a.example/x?y=1) وأيضاً https://b.example/z. ![صورة](/api/image?prompt=cat&w=512)');
  const links = p.filter((x) => x.t === 'link');
  assert.deepEqual(links.map((l) => l.t === 'link' && l.url), ['https://a.example/x?y=1', 'https://b.example/z']);
  assert.equal(links[0].t === 'link' && links[0].label, 'مصدر أ');
  assert.ok(p.some((x) => x.t === 'image' && x.src.startsWith('/api/image?')));
  // النقطة بعد الرابط المجرد تبقى نصاً ولا تدخل في الرابط
  assert.ok(p.some((x) => x.t === 'text' && x.text.startsWith('.')));
});

test('linkify: لا روابط خطرة ولا صور خارجية', () => {
  const evil = linkify('[اضغط](javascript:alert(1)) و [x](data:text/html,hi) و ![i](https://evil.example/a.png) و ftp://x.example');
  assert.ok(!evil.some((x) => x.t === 'link' && !/^https?:/.test(x.url)));
  assert.ok(!evil.some((x) => x.t === 'image'));
  assert.equal(evil.map((x) => (x.t === 'text' ? x.text : x.t === 'link' ? x.label : '')).join('').includes('javascript'), true);
});

test('linkify: علامات الترقيم العربية والأقواس بعد الرابط', () => {
  const p = linkify('(https://a.example/p)، ثم https://b.example/q؟');
  const urls = p.flatMap((x) => (x.t === 'link' ? [x.url] : []));
  assert.deepEqual(urls, ['https://a.example/p', 'https://b.example/q']);
  assert.equal(hostOf('https://www.a.example/p'), 'a.example');
});

test('المصادر: صيغة قابلة للنقر وتنظيف العنوان والأقواس', () => {
  const m = new Map();
  addSource(m, 'https://w.example/a_(b)', 'عنوان [مهم] جداً');
  const out = formatSources(['س'], [...m.values()]);
  assert.match(out, /1\. \[عنوان \(مهم\) جداً\]\(https:\/\/w\.example\/a_%28b%29\)/);
  const links = linkify(out).filter((x) => x.t === 'link');
  assert.equal(links.length, 1);
  assert.equal(links[0].t === 'link' && links[0].url, 'https://w.example/a_%28b%29');
});

test('stripSources يحذف الاستعلامات والمصادر فقط', () => {
  const body = 'نص الجواب هنا.';
  const full = body + formatSources(['q'], [{ url: 'https://a.example/', title: 'a' }]);
  assert.equal(stripSources(full), body);
  assert.equal(stripSources(body), body);
});

test('السلاسل: الحد الأقصى، ومدخل الخطوة التالية، والسلاسل الجاهزة صالحة', () => {
  let s: ReturnType<typeof addStep> = [];
  for (let i = 0; i < 10; i++) s = addStep(s, 'TEXT');
  assert.equal(s.length, MAX_STEPS);
  assert.equal(nextInput('x'.repeat(MAX_INPUT_LENGTH + 500)).length, MAX_INPUT_LENGTH);
  const ids = new Set<string>(ENGINES.map((e) => e.id));
  for (const p of PRESETS) {
    assert.ok(p.steps.length >= 2 && p.steps.length <= MAX_STEPS, p.id);
    assert.ok(p.steps.every((x) => ids.has(x)), p.id);
  }
});
