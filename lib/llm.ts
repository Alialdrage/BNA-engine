// طبقة الاتصال بـ Claude API. تُستخدم على الخادم فقط، والمفتاح لا يصل إلى المتصفح أبداً.
import { sseData } from './sse';
import { addSource, formatSources, type Source } from './sources';

const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-5-5';
const TIMEOUT_MS = 60000;

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type StreamOptions = {
  /** تفعيل أداة البحث في الويب مع حد أقصى لعدد عمليات البحث */
  webSearchMaxUses?: number;
  maxTokens?: number;
};

function webSearchToolType(): string {
  const t = process.env.ANTHROPIC_WEB_SEARCH_TOOL?.trim();
  return t && /^web_search_\d{8}$/.test(t) ? t : 'web_search_20250305';
}

export function llmAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// بث الرد قطعة قطعة (SSE)
export async function* streamClaude(
  system: string,
  userText: string,
  history: ChatMessage[] = [],
  opts: StreamOptions = {},
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
        max_tokens: opts.maxTokens ?? 2000,
        stream: true,
        system,
        messages: [...history, { role: 'user', content: userText }],
        ...(opts.webSearchMaxUses
          ? {
              tools: [
                { type: webSearchToolType(), name: 'web_search', max_uses: opts.webSearchMaxUses },
              ],
            }
          : {}),
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
  const results = new Map<string, Source>();
  const cited = new Map<string, Source>();
  const queries: string[] = [];
  const toolInput = new Map<number, string>();
  let paused = false;

  for await (const data of sseData(res)) {
    let evt: {
      type?: string;
      index?: number;
      content_block?: {
        type?: string;
        content?: unknown;
      };
      delta?: {
        type?: string;
        text?: string;
        partial_json?: string;
        stop_reason?: string;
        citation?: { url?: string; title?: string };
      };
    };
    try {
      evt = JSON.parse(data);
    } catch {
      continue;
    }
    if (evt.type === 'error') {
      throw new Error('انقطع الرد من خدمة الذكاء الاصطناعي');
    }
    const idx = evt.index ?? -1;
    if (evt.type === 'content_block_start' && evt.content_block?.type === 'server_tool_use') {
      toolInput.set(idx, '');
    } else if (evt.type === 'content_block_start' && evt.content_block?.type === 'web_search_tool_result') {
      // عند الخطأ يكون content كائناً وليس مصفوفة
      if (Array.isArray(evt.content_block.content)) {
        for (const r of evt.content_block.content as Array<{ url?: string; title?: string }>) {
          addSource(results, r.url, r.title);
        }
      }
    } else if (evt.type === 'content_block_delta') {
      const d = evt.delta;
      if (d?.type === 'text_delta' && d.text) {
        produced = true;
        yield d.text;
      } else if (d?.type === 'input_json_delta' && toolInput.has(idx)) {
        toolInput.set(idx, (toolInput.get(idx) ?? '') + (d.partial_json ?? ''));
      } else if (d?.type === 'citations_delta') {
        addSource(cited, d.citation?.url, d.citation?.title);
      }
    } else if (evt.type === 'content_block_stop' && toolInput.has(idx)) {
      try {
        const q = (JSON.parse(toolInput.get(idx) ?? '{}') as { query?: unknown }).query;
        if (typeof q === 'string' && q) queries.push(q.slice(0, 120));
      } catch {
        /* استعلام غير مفهوم */
      }
      toolInput.delete(idx);
    } else if (evt.type === 'message_delta' && evt.delta?.stop_reason === 'pause_turn') {
      paused = true;
    }
  }
  if (!produced) {
    throw new Error('لم يصل رد من خدمة الذكاء الاصطناعي');
  }
  if (opts.webSearchMaxUses) {
    const list = cited.size ? [...cited.values()] : [...results.values()];
    yield formatSources(queries, list);
    if (paused) yield '\n\n⚠️ توقف البحث قبل اكتماله، أعد الطلب أو اجعله أضيق.';
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
