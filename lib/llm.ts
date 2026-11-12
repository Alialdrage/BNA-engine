// طبقة الاتصال بـ Claude API. تُستخدم على الخادم فقط، والمفتاح لا يصل إلى المتصفح أبداً.

const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-5-5';
const TIMEOUT_MS = 30000;

export function llmAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function askClaude(system: string, userText: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('مفتاح الذكاء الاصطناعي غير مضبوط');
  }

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        max_tokens: 1500,
        system,
        messages: [{ role: 'user', content: userText }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error('تعذر الوصول لخدمة الذكاء الاصطناعي، أو انتهت المهلة');
  }

  if (!res.ok) {
    throw new Error(`خدمة الذكاء الاصطناعي رجعت خطأ (${res.status})`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = (data.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('لم يصل رد من خدمة الذكاء الاصطناعي');
  }
  return text;
}
