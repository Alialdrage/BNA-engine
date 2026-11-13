// توليد الصور عبر Pollinations (خدمة مجانية بلا مفتاح). الطلب يمر عبر خادمنا للتحقق وتحديد المعدل.

export const IMAGE_MODELS = ['flux', 'turbo'] as const;
export const MAX_IMAGE_PROMPT = 500;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type ImageParams = { prompt: string; width: number; height: number; seed: number; model: string };

const clampDim = (n: number) => Math.min(1536, Math.max(256, Math.round(n / 64) * 64));

export function parseImageParams(sp: URLSearchParams): ImageParams | { error: string } {
  const prompt = (sp.get('prompt') ?? '').trim();
  if (!prompt) return { error: 'اكتب وصف الصورة' };
  if (prompt.length > MAX_IMAGE_PROMPT) return { error: `الوصف طويل (الحد ${MAX_IMAGE_PROMPT} حرف)` };
  const num = (k: string, d: number) => {
    const v = Number(sp.get(k));
    return Number.isFinite(v) && sp.get(k) !== null && sp.get(k) !== '' ? v : d;
  };
  const model = sp.get('model') ?? 'flux';
  return {
    prompt,
    width: clampDim(num('w', 1024)),
    height: clampDim(num('h', 1024)),
    seed: Math.abs(Math.floor(num('seed', 0))) % 1_000_000,
    model: (IMAGE_MODELS as readonly string[]).includes(model) ? model : 'flux',
  };
}

export function upstreamUrl(p: ImageParams): string {
  return (
    `https://image.pollinations.ai/prompt/${encodeURIComponent(p.prompt)}` +
    `?width=${p.width}&height=${p.height}&seed=${p.seed}&model=${p.model}&nologo=true`
  );
}

// رابط داخلي نعرضه في الواجهة
export function localImageUrl(p: Omit<ImageParams, 'model'> & { model?: string }): string {
  const q = new URLSearchParams({
    prompt: p.prompt, w: String(p.width), h: String(p.height), seed: String(p.seed),
  });
  if (p.model) q.set('model', p.model);
  return `/api/image?${q.toString()}`;
}

export function sizeFromText(text: string): { width: number; height: number } {
  if (/عمودي|portrait|vertical|ستوري|story/i.test(text)) return { width: 768, height: 1024 };
  if (/أفقي|افقي|landscape|wide|يوتيوب|youtube|16:9/i.test(text)) return { width: 1024, height: 576 };
  return { width: 1024, height: 1024 };
}
