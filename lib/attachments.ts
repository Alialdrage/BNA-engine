// مرفقات الطلب (صور وPDF) كما تصل من المتصفح. لا نثق بها: نتحقق من النوع والحجم والترميز.
export type Attachment = { mime: string; data: string; name?: string };

export const ATTACHMENT_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'] as const;
export const MAX_ATTACHMENTS = 3;
const MAX_ONE = 3_300_000; // حروف base64 (~2.4MB)
const MAX_TOTAL = 3_600_000; // حد جسم الطلب في Vercel 4.5MB

export function sanitizeAttachments(raw: unknown): Attachment[] | { error: string } {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return { error: 'مرفقات غير صالحة' };
  if (raw.length > MAX_ATTACHMENTS) return { error: `الحد الأقصى ${MAX_ATTACHMENTS} مرفقات` };
  const out: Attachment[] = [];
  let total = 0;
  for (const a of raw) {
    const { mime, data, name } = (typeof a === 'object' && a !== null ? a : {}) as Record<string, unknown>;
    if (typeof mime !== 'string' || !(ATTACHMENT_MIMES as readonly string[]).includes(mime)) {
      return { error: 'نوع المرفق غير مدعوم (صور PNG/JPG/WebP/GIF وPDF فقط)' };
    }
    if (typeof data !== 'string' || data.length === 0 || data.length > MAX_ONE || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      return { error: 'مرفق كبير أو تالف (الحد نحو 2.4MB للملف الواحد)' };
    }
    total += data.length;
    if (total > MAX_TOTAL) return { error: 'حجم المرفقات كبير، قلّل عددها أو حجمها' };
    out.push({ mime, data, name: typeof name === 'string' ? name.slice(0, 80) : undefined });
  }
  return out;
}
