// تجهيز الملفات في المتصفح قبل الإرسال: تصغير الصور، قراءة النصوص، رفض ما لا ندعمه.
import type { Attachment } from './attachments';

export type PreparedFile = { id: string; name: string; att?: Attachment; text?: string };

const TEXT_EXT = /\.(txt|md|csv|tsv|json|xml|html?|css|js|jsx|ts|tsx|py|java|c|cpp|cs|go|rs|php|rb|sql|sh|yml|yaml|ini|log|srt)$/i;
const MAX_TEXT = 12000;
const MAX_PDF_BYTES = 2_400_000;
const MAX_DIM = 1280;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('تعذر قراءة الملف'));
    r.readAsDataURL(blob);
  });
}

async function downscale(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('تعذر فتح الصورة'));
      i.src = url;
    });
    const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('تعذر معالجة الصورة');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareFile(file: File): Promise<PreparedFile> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const name = file.name.slice(0, 80);
  if (file.type.startsWith('image/')) {
    const dataUrl = await downscale(file);
    return { id, name, att: { mime: 'image/jpeg', data: dataUrl.split(',')[1], name } };
  }
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    if (file.size > MAX_PDF_BYTES) throw new Error('ملف PDF كبير (الحد 2.4MB). قسّمه أو الصق النص المهم.');
    const dataUrl = await readAsDataUrl(file);
    return { id, name, att: { mime: 'application/pdf', data: dataUrl.split(',')[1], name } };
  }
  if (file.type.startsWith('text/') || file.type === 'application/json' || TEXT_EXT.test(file.name)) {
    if (file.size > 2_000_000) throw new Error('الملف النصي كبير جداً');
    let text = await file.text();
    if (text.length > MAX_TEXT) text = `${text.slice(0, MAX_TEXT)}\n[… اقتُطع الباقي]`;
    return { id, name, text };
  }
  throw new Error('نوع الملف غير مدعوم. المدعوم: صور، PDF، ونصوص (txt, md, csv, json, كود). لملفات Word/Excel احفظها PDF أو الصق نصها.');
}
