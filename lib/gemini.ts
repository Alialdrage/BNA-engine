// طبقة الاتصال بـ Gemini API. تُستخدم على الخادم فقط، والمفتاح لا يصل إلى المتصفح أبداً.

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 30000;

export type GeminiModelKey = 'GEMINI4' | 'GEMINI38';

// المعرفات من صفحة Google الرسمية، ويمكن تغييرها من المتغيرات البيئية
const MODEL_DEFAULTS: Record<GeminiModelKey, { env: string; id: string }> = {
  GEMINI4: { env: 'GEMINI4_MODEL', id: 'gemini-4-argon' },
  GEMINI38: { env: 'GEMINI38_MODEL', id: 'gemini-3.8-flash' },
};

export function geminiAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function geminiModelId(key: GeminiModelKey): string {
  const { env, id } = MODEL_DEFAULTS[key];
  const custom = process.env[env]?.trim();
  // نسمح فقط بحروف وأرقام ونقاط وشرطات لمنع حقن مسار في الرابط
  return custom && /^[\w.-]+$/.test(custom) ? custom : id;
}

export async function askGemini(
  key: GeminiModelKey,
  system: string,
  userText: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('مفتاح Gemini غير مضبوط');
  }

  const model = geminiModelId(key);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: { maxOutputTokens: 1500 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error('تعذر الوصول لخدمة Gemini، أو انتهت المهلة');
  }

  if (!res.ok) {
    throw new Error(`خدمة Gemini رجعت خطأ (${res.status})`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('لم يصل رد من Gemini');
  }
  return text;
}
