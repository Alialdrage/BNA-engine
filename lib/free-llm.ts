// مزوّد احتياطي مجاني بلا مفتاح (Pollinations النصي). يعمل فقط عند غياب مفاتيح Claude/Gemini.
// تنبيه: النص المرسل يذهب لطرف ثالث، والخدمة محدودة المعدل. عطّله بـ FREE_LLM=off.
import type { ChatMessage } from './llm';

const URL_ = 'https://text.pollinations.ai/openai';

export function freeLlmAvailable(): boolean {
  return (process.env.FREE_LLM ?? 'on').toLowerCase() !== 'off';
}

export async function* streamFree(
  system: string,
  userText: string,
  history: ChatMessage[] = [],
): AsyncGenerator<string> {
  const messages = [
    { role: 'system', content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userText },
  ];
  let res: Response;
  try {
    res = await fetch(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai', messages }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    yield 'تعذر الوصول للخدمة المجانية الآن. حاول بعد قليل، أو اضبط ANTHROPIC_API_KEY لتوليد مستقر.';
    return;
  }
  if (!res.ok) {
    yield res.status === 429 || res.status === 402
      ? 'الخدمة المجانية مشغولة (حد الطلبات). انتظر نحو نصف دقيقة وأعد المحاولة، أو اضبط مفتاح API لتوليد مستقر.'
      : `الخدمة المجانية رجعت خطأ (${res.status}). حاول لاحقاً.`;
    return;
  }
  try {
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    yield text || 'لم يصل رد من الخدمة المجانية. أعد المحاولة.';
  } catch {
    yield 'رد غير مفهوم من الخدمة المجانية. أعد المحاولة.';
  }
}
