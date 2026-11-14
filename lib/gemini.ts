// طبقة الاتصال بـ Gemini API. تُستخدم على الخادم فقط، والمفتاح لا يصل إلى المتصفح أبداً.
import { sseData } from './sse';
import { addSource, formatSources, type Source } from './sources';
import type { ChatMessage, StreamOptions } from './llm';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 60000;
const LONG_TIMEOUT_MS = 110000; // التأليف الطويل والبحث

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

export async function* streamGemini(
  key: GeminiModelKey,
  system: string,
  userText: string,
  history: ChatMessage[] = [],
  opts: StreamOptions = {},
): AsyncGenerator<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('مفتاح Gemini غير مضبوط');
  }

  const model = geminiModelId(key);
  const contents = [
    ...history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    {
      role: 'user',
      parts: [
        ...(opts.attachments ?? []).map((a) => ({ inlineData: { mimeType: a.mime, data: a.data } })),
        { text: userText },
      ],
    },
  ];

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { maxOutputTokens: opts.maxTokens ?? 2000 },
        ...(opts.webSearchMaxUses ? { tools: [{ google_search: {} }] } : {}),
      }),
      signal: AbortSignal.timeout((opts.maxTokens ?? 0) > 3000 || opts.webSearchMaxUses ? LONG_TIMEOUT_MS : TIMEOUT_MS),
    });
  } catch {
    throw new Error('تعذر الوصول لخدمة Gemini، أو انتهت المهلة');
  }

  if (!res.ok) {
    throw new Error(`خدمة Gemini رجعت خطأ (${res.status})`);
  }

  let produced = false;
  const sources = new Map<string, Source>();
  const queries: string[] = [];
  for await (const data of sseData(res)) {
    let evt: {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        groundingMetadata?: {
          webSearchQueries?: string[];
          groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
        };
      }>;
    };
    try {
      evt = JSON.parse(data);
    } catch {
      continue;
    }
    const gm = evt.candidates?.[0]?.groundingMetadata;
    for (const c of gm?.groundingChunks ?? []) addSource(sources, c.web?.uri, c.web?.title);
    for (const q of gm?.webSearchQueries ?? []) if (typeof q === 'string') queries.push(q.slice(0, 120));
    const text = (evt.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    if (text) {
      produced = true;
      yield text;
    }
  }
  if (!produced) {
    throw new Error('لم يصل رد من Gemini');
  }
  if (opts.webSearchMaxUses) yield formatSources(queries, [...sources.values()]);
}

export async function askGemini(
  key: GeminiModelKey,
  system: string,
  userText: string,
  history: ChatMessage[] = [],
): Promise<string> {
  let out = '';
  for await (const chunk of streamGemini(key, system, userText, history)) out += chunk;
  return out.trim();
}
