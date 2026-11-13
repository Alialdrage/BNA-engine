// تصدير الكتاب إلى Word (docx) بدعم الاتجاه من اليمين لليسار.
import { AlignmentType, Document, HeadingLevel, PageBreak, Paragraph, TextRun } from 'docx';
import { paragraphs, type Book } from './book';

const FONT = 'Arial';
const run = (text: string, opts: { bold?: boolean; size?: number } = {}) =>
  new TextRun({ text, rightToLeft: true, font: FONT, bold: opts.bold, size: opts.size, language: { value: 'ar-SA' } } as never);

export function buildDocx(b: Book): Document {
  const children: Paragraph[] = [];
  const center = AlignmentType.CENTER;

  // الغلاف
  children.push(
    new Paragraph({ bidirectional: true, alignment: center, spacing: { before: 3600, after: 300 }, children: [run(b.title || 'كتاب بلا عنوان', { bold: true, size: 72 })] }),
  );
  if (b.subtitle) {
    children.push(new Paragraph({ bidirectional: true, alignment: center, spacing: { after: 600 }, children: [run(b.subtitle, { size: 32 })] }));
  }
  if (b.author) {
    children.push(new Paragraph({ bidirectional: true, alignment: center, children: [run(b.author, { size: 30 })] }));
  }
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // الفهرس
  children.push(new Paragraph({ bidirectional: true, heading: HeadingLevel.HEADING_1, alignment: center, spacing: { after: 300 }, children: [run('الفهرس', { bold: true, size: 36 })] }));
  b.chapters.forEach((c, i) => {
    children.push(new Paragraph({ bidirectional: true, spacing: { after: 120 }, children: [run(`${i + 1}. ${c.title}`, { size: 26 })] }));
  });

  // الفصول
  b.chapters.forEach((c, i) => {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ bidirectional: true, alignment: center, children: [run(`الفصل ${i + 1}`, { size: 28 })] }));
    children.push(
      new Paragraph({ bidirectional: true, heading: HeadingLevel.HEADING_1, alignment: center, spacing: { after: 400 }, children: [run(c.title, { bold: true, size: 40 })] }),
    );
    for (const p of paragraphs(c.content)) {
      children.push(
        new Paragraph({ bidirectional: true, alignment: AlignmentType.BOTH, spacing: { after: 160, line: 400 }, indent: { firstLine: 500 }, children: [run(p, { size: 26 })] }),
      );
    }
  });

  return new Document({
    title: b.title,
    creator: b.author || 'BNA Engine',
    sections: [{ properties: { page: { margin: { top: 1300, bottom: 1300, left: 1300, right: 1300 } } }, children }],
  });
}
