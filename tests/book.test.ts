import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Packer } from 'docx';
import {
  EMPTY_BOOK, bookBodyHtml, bookToHtml, bookToMarkdown, chapterPrompt, cleanChapterText,
  escapeHtml, outlinePrompt, paragraphs, parseOutline, safeFileName, wordCount, type Book,
} from '../lib/book';
import { buildDocx } from '../lib/book-docx';

const book: Book = {
  ...EMPTY_BOOK,
  title: 'رحلة <بغداد> & "الأمل"',
  subtitle: 'قصص من المدينة',
  author: 'علي',
  kind: 'رواية',
  brief: 'قصة عن مدينة',
  chapters: [
    { id: '1', title: 'البداية', content: '## البداية\n\nكان الصباح **جميلاً**.\n\n- سار في الشارع\nوصل المقهى.' },
    { id: '2', title: 'النهاية', content: 'انتهى كل شيء.' },
  ],
};

test('parseOutline يقبل JSON نظيفاً ومحاطاً بنص وأسوار الكود', () => {
  const json = '{"title":"ت","subtitle":"ف","chapters":[{"title":"أ","summary":"س"},{"title":"ب"}]}';
  assert.equal(parseOutline(json)?.chapters.length, 2);
  assert.equal(parseOutline('```json\n' + json + '\n```')?.title, 'ت');
  assert.equal(parseOutline('تفضل المخطط:\n' + json + '\nتمنياتي')?.chapters[1].title, 'ب');
});

test('parseOutline يرفض المدخلات الفاسدة ويقصّ العدد', () => {
  assert.equal(parseOutline('لا يوجد json'), null);
  assert.equal(parseOutline('{"chapters":"x"}'), null);
  assert.equal(parseOutline('{"chapters":[{"title":""},{}]}'), null);
  assert.equal(parseOutline('{broken'), null);
  const many = JSON.stringify({ chapters: Array.from({ length: 50 }, (_, i) => ({ title: `ف${i}` })) });
  assert.equal(parseOutline(many)?.chapters.length, 30);
});

test('cleanChapterText يزيل رموز الماركداون وlتبقى الفقرات', () => {
  const t = cleanChapterText(book.chapters[0].content);
  assert.ok(!/[#*]|^- /m.test(t), t);
  assert.match(t, /كان الصباح جميلاً/);
  assert.deepEqual(paragraphs(book.chapters[1].content), ['انتهى كل شيء.']);
});

test('الأوامر تتضمن السياق: المخطط والفصل السابق وعنوان الفصل', () => {
  const p = chapterPrompt(book, 1);
  assert.match(p, /الفصل رقم 2/);
  assert.match(p, /1\. البداية\n2\. النهاية/);
  assert.match(p, /نهاية الفصل السابق/);
  assert.doesNotMatch(chapterPrompt(book, 0), /نهاية الفصل السابق/);
  assert.match(outlinePrompt(book, 7), /عدد الفصول: 7/);
});

test('HTML يهرّب المحتوى ولا يسمح بحقن وسوم', () => {
  const evil: Book = { ...book, title: '<script>alert(1)</script>', chapters: [{ id: 'x', title: '<img src=x onerror=1>', content: '<b>x</b>' }] };
  const html = bookToHtml(evil);
  assert.ok(!/<script>alert|<img src=x|<b>x<\/b>/.test(html));
  assert.match(bookBodyHtml(book), /الفصل 2/);
  assert.equal(escapeHtml('a&b<"'), 'a&amp;b&lt;&quot;');
  assert.match(html, /dir="rtl"/);
});

test('Markdown والعدّاد وأسماء الملفات', () => {
  const md = bookToMarkdown(book);
  assert.match(md, /^# /);
  assert.match(md, /## 2\. النهاية/);
  assert.ok(wordCount(book) > 5);
  
  assert.ok(!/[\\/:*?"<>|]/.test(safeFileName('a/b:c*?"d')));
  assert.equal(safeFileName(''), 'book');
});

test('docx: ملف صالح فيه الغلاف والفهرس والفصول واتجاه RTL', async () => {
  const buf = await Packer.toBuffer(buildDocx(book));
  assert.equal(buf.subarray(0, 2).toString(), 'PK');
  const dir = mkdtempSync(join(tmpdir(), 'bk-'));
  const file = join(dir, 'b.docx');
  writeFileSync(file, buf);
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });
  for (const s of ['البداية', 'النهاية', 'الفهرس', 'علي', 'انتهى كل شيء.']) assert.ok(xml.includes(s), s);
  assert.match(xml, /<w:bidi\/>/);
  assert.match(xml, /<w:rtl\/>/);
  assert.ok(!xml.includes('**'));
});
