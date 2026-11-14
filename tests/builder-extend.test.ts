import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { androidProject, appIdFor, parseProject, sanitizePath, zipProject } from '../lib/project';
import { importPack, mergeSkills, normalizeSkill, exportPack } from '../lib/custom-skills';
import { isPrivateAddress, loadExternalTools, runExternalTool } from '../lib/external-tools';
import { allTools, runTool } from '../lib/tools';
import { resolveEngine, runEngine } from '../lib/bna-engine';
import { looksLikeBuildRequest } from '../lib/smalltalk';

const SAMPLE = `PROJECT: todo-app | قائمة المهام
=== FILE: index.html ===
\`\`\`html
<h1>مرحبا</h1>
\`\`\`
=== END FILE ===
=== FILE: ../evil.txt ===
x
=== END FILE ===
=== FILE: /abs.txt ===
x
=== END FILE ===
=== FILE: js/app.js ===
console.log(1)
=== END FILE ===
شرح`;

test('تحليل المشروع يرفض المسارات الخطرة ويزيل أسوار الكود', () => {
  const p = parseProject(SAMPLE)!;
  assert.equal(p.slug, 'todo-app');
  assert.equal(p.title, 'قائمة المهام');
  assert.deepEqual(p.files.map((f) => f.path), ['index.html', 'js/app.js']);
  assert.equal(p.files[0].content, '<h1>مرحبا</h1>');
  assert.equal(parseProject('نص عادي'), null);
  for (const bad of ['../x', '/x', 'a/../b', 'C:/x', 'a//b', '']) assert.equal(sanitizePath(bad), null, bad);
  assert.equal(sanitizePath('src/a.js'), 'src/a.js');
});

test('ZIP صالح ويحتفظ بالمحتوى العربي', () => {
  const p = parseProject(SAMPLE)!;
  const out = unzipSync(zipProject(p.files));
  assert.equal(strFromU8(out['index.html']), '<h1>مرحبا</h1>');
  assert.ok(out['js/app.js']);
});

test('هيكل APK: ينقل الملفات إلى www ويضيف Capacitor وسير العمل', () => {
  const r = androidProject(parseProject(SAMPLE)!);
  assert.ok('files' in r);
  if (!('files' in r)) return;
  const paths = r.files.map((f) => f.path);
  for (const need of ['www/index.html', 'www/js/app.js', 'package.json', 'capacitor.config.json', '.github/workflows/android-apk.yml', 'ANDROID-README.md']) {
    assert.ok(paths.includes(need), need);
  }
  const cfg = JSON.parse(r.files.find((f) => f.path === 'capacitor.config.json')!.content);
  assert.equal(cfg.webDir, 'www');
  assert.match(cfg.appId, /^com\.bna\.[a-z][a-z0-9]*$/);
  const wf = r.files.find((f) => f.path.endsWith('android-apk.yml'))!.content;
  assert.match(wf, /assembleDebug/);
  assert.match(wf, /upload-artifact/);
  assert.match(appIdFor('3d-game'), /^com\.bna\.a3dgame$/);
  const noWeb = androidProject({ slug: 'x', title: 'x', files: [{ path: 'main.py', content: 'print(1)' }] });
  assert.ok('error' in noWeb);
});

test('المهارات المخصصة: تنظيف واستيراد ودمج وتصدير', () => {
  assert.equal(normalizeSkill({ name: 'x', system: 'قصير' }), null);
  const s = normalizeSkill({ name: 'مسوّق ذكي', icon: '📣', system: 'أنت خبير تسويق يكتب إعلانات قصيرة.' })!;
  assert.equal(s.name, 'مسوّق-ذكي');
  const packText = exportPack([s]);
  const back = importPack(packText);
  assert.ok('skills' in back && back.skills[0].name === s.name);
  assert.ok('error' in importPack('not json'));
  assert.ok('error' in importPack('{"skills":[{"name":"a"}]}'));
  assert.equal(mergeSkills([s], [{ ...s, system: 'تعليمات جديدة طويلة كفاية' }]).length, 1);
});

test('حارس العناوين الداخلية', () => {
  for (const a of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.20.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:10.0.0.1', '0.0.0.0']) {
    assert.equal(isPrivateAddress(a), true, a);
  }
  for (const a of ['8.8.8.8', '93.184.216.34', '2606:4700::1111']) assert.equal(isPrivateAddress(a), false, a);
});

test('الأدوات الخارجية: التحقق من التعريف والاستدعاء', async () => {
  const raw = JSON.stringify([
    { name: 'weather', description: 'الطقس', url: 'https://93.184.216.34/w', header: 'Authorization', secret: 'Bearer s' },
    { name: 'calculate', description: 'يتعارض مع مدمجة', url: 'https://93.184.216.34/x' },
    { name: 'http_one', description: 'http مرفوض', url: 'http://example.com/x' },
    { name: 'Bad Name', description: 'اسم سيئ', url: 'https://example.com' },
    { name: 'local', description: 'داخلي', url: 'https://127.0.0.1/x' },
  ]);
  const tools = loadExternalTools(raw);
  assert.deepEqual(tools.map((t) => t.name), ['weather', 'local']);
  assert.deepEqual(loadExternalTools('garbage'), []);

  let seen: { url: string; headers: Record<string, string>; body: string } | undefined;
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
    seen = { url: String(u), headers: init?.headers as Record<string, string>, body: String(init?.body) };
    return new Response('مشمس 30°', { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal(await runExternalTool('weather', 'بغداد', tools), 'مشمس 30°');
    assert.equal(seen?.headers.Authorization, 'Bearer s');
    assert.equal(JSON.parse(seen!.body).input, 'بغداد');
    seen = undefined;
    assert.match((await runExternalTool('local', 'x', tools)) ?? '', /ممنوع/);
    assert.equal(seen, undefined, 'لا يجب أن يصل الطلب للشبكة الداخلية');
    assert.equal(await runExternalTool('nope', 'x', tools), null);
    process.env.EXTERNAL_TOOLS = raw;
    assert.ok(allTools().some((t) => t.name === 'weather'));
    assert.equal(await runTool('weather', { input: 'بغداد' }), 'مشمس 30°');
  } finally {
    globalThis.fetch = real;
    delete process.env.EXTERNAL_TOOLS;
  }
});

test('توجيه AUTO لباني المشاريع، والمهارة المخصصة ترسل تعليماتها', async () => {
  assert.ok(looksLikeBuildRequest('ابني لي تطبيق أندرويد لإدارة المصاريف'));
  assert.ok(looksLikeBuildRequest('make an apk for notes'));
  assert.equal(resolveEngine('AUTO', 'ابني لي موقع لمطعمي مع ملف zip'), 'BUILDER');
  assert.equal(resolveEngine('AUTO', 'اكتب برنامج بايثون يحسب المتوسط'), 'CODE');

  let sys = '';
  const real = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = 'k';
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    sys = JSON.parse(String(init?.body)).system;
    const bytes = new TextEncoder().encode(
      [
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'تم' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      ].map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''),
    );
    return new Response(new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }));
  }) as typeof fetch;
  try {
    const r = await runEngine('CUSTOM', 'اكتب إعلان', [], '', [], { name: 'مسوّق', system: 'أنت خبير تسويق بالعراقية.' });
    assert.equal(r.text, 'تم');
    assert.match(sys, /خبير تسويق/);
    assert.match(sys, /لا تنفذ/);
  } finally {
    globalThis.fetch = real;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

import { fetchGithubSkills, parseGithubUrl, parseSkillMd } from '../lib/github-skills';

test('تحليل روابط GitHub', () => {
  assert.deepEqual(parseGithubUrl('owner/repo'), { owner: 'owner', repo: 'repo', path: '', isFile: false });
  assert.deepEqual(parseGithubUrl('https://github.com/a/b.git'), { owner: 'a', repo: 'b', path: '', isFile: false });
  assert.deepEqual(parseGithubUrl('https://github.com/a/b/tree/dev/skills/x'), { owner: 'a', repo: 'b', ref: 'dev', path: 'skills/x', isFile: false });
  assert.deepEqual(parseGithubUrl('https://github.com/a/b/blob/main/s/SKILL.md'), { owner: 'a', repo: 'b', ref: 'main', path: 's/SKILL.md', isFile: true });
  assert.equal(parseGithubUrl('https://raw.githubusercontent.com/a/b/main/s.json')?.isFile, true);
  for (const bad of ['http://github.com/a/b', 'https://evil.com/a/b', 'https://github.com/a', 'https://github.com/a/b/blob/main/../x', 'a b/c', 'javascript:alert(1)', '']) {
    assert.equal(parseGithubUrl(bad), null, bad);
  }
});

test('تحليل SKILL.md', () => {
  const r = parseSkillMd('---\nname: code reviewer\ndescription: يراجع الكود\n---\n# عنوان\nراجع الكود وأعط ملاحظات أمنية.', 'x')!;
  assert.equal(r.skill.name, 'code-reviewer');
  assert.match(r.skill.system, /يراجع الكود[\s\S]*ملاحظات أمنية/);
  assert.equal(r.truncated, false);
  assert.equal(parseSkillMd('x'.repeat(3000), 'big')!.truncated, true);
  assert.equal(parseSkillMd('قصير', 'x'), null);
});

test('جلب المهارات من GitHub (fetch وهمي): حزمة JSON، وSKILL.md من الشجرة', async () => {
  const calls: string[] = [];
  const tree = {
    tree: [
      { path: 'skills/a/SKILL.md', type: 'blob', size: 100 },
      { path: 'skills/b/SKILL.md', type: 'blob', size: 100 },
      { path: 'README.md', type: 'blob', size: 10 },
      { path: 'big/SKILL.md', type: 'blob', size: 9_999_999 },
    ],
  };
  const fake = (async (u: unknown) => {
    const url = String(u);
    calls.push(url);
    if (url.endsWith('/bna-skills.json')) return new Response('nf', { status: 404 });
    if (url.includes('api.github.com')) return new Response(JSON.stringify(tree));
    if (url.includes('/skills/a/SKILL.md')) return new Response('---\nname: alpha\ndescription: وصف ألفا\n---\nتعليمات ألفا الكاملة هنا.');
    if (url.includes('/skills/b/SKILL.md')) return new Response('# Beta\nتعليمات بيتا الكاملة هنا للتجربة.');
    return new Response('?', { status: 404 });
  }) as typeof fetch;
  const r = await fetchGithubSkills({ owner: 'o', repo: 'r', path: '', isFile: false }, fake);
  assert.ok('skills' in r);
  if ('skills' in r) assert.deepEqual(r.skills.map((s) => s.name).sort(), ['Beta', 'alpha']);
  assert.ok(calls.every((c) => /^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//.test(c)), calls.join());

  const packFake = (async () => new Response(JSON.stringify({ skills: [{ name: 'مترجم', system: 'ترجم النص إلى الإنجليزية بدقة.' }] }))) as typeof fetch;
  const p = await fetchGithubSkills({ owner: 'o', repo: 'r', ref: 'main', path: 'x/bna-skills.json', isFile: true }, packFake);
  assert.ok('skills' in p && p.skills[0].name === 'مترجم');

  const none = (async () => new Response('nf', { status: 404 })) as typeof fetch;
  const e = await fetchGithubSkills({ owner: 'o', repo: 'r', path: '', isFile: false }, none);
  assert.ok('error' in e);
});
