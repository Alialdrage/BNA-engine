// طبقة الاتصال بـ Claude API. تُستخدم على الخادم فقط، والمفتاح لا يصل إلى المتصفح أبداً.
import { sseData } from './sse';

const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-5-5';
const TIMEOUT_MS = 60000;

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export function llmAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// بث الرد قطعة قطعة (SSE)
export async function* streamClaude(
  system: string,
  userText: string,
  history: ChatMessage[] = [],
): AsyncGenerator<string> {
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
        max_tokens: 2000,
        stream: true,
        system,
        messages: [...history, { role: 'user', content: userText }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error('تعذر الوصول لخدمة الذكاء الاصطناعي، أو انتهت المهلة');
  }

  if (!res.ok) {
    throw new Error(`خدمة الذكاء الاصطناعي رجعت خطأ (${res.status})`);
  }

  let produced = false;
  for await (const data of sseData(res)) {
    let evt: {
      type?: string;
      delta?: { type?: string; text?: string };
    };
    try {
      evt = JSON.parse(data);
    } catch {
      continue;
    }
    if (evt.type === 'error') {
      throw new Error('انقطع الرد من خدمة الذكاء الاصطناعي');
    }
    if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
      produced = true;
      yield evt.delta.text;
    }
  }
  if (!produced) {
    throw new Error('لم يصل رد من خدمة الذكاء الاصطناعي');
  }
}

export async function askClaude(
  system: string,
  userText: string,
  history: ChatMessage[] = [],
): Promise<string> {
  let out = '';
  for await (const chunk of streamClaude(system, userText, history)) out += chunk;
  return out.trim();
}
