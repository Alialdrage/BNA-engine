// طبقة الاتصال بـ Claude API. تُستخدم على الخادم فقط، والمفتاح لا يصل إلى المتصفح أبداً.
import { sseData } from './sse';
import type { Attachment } from './attachments';
import { MAX_TOOL_ROUNDS, TOOLS, runTool, toolsEnabled } from './tools';
import { addSource, formatSources, type Source } from './sources';

const DEFAULT_BASE = 'https://api.anthropic.com';

// يمكن تغيير العنوان (بوابة أو وكيل داخلي) من ANTHROPIC_BASE_URL
function apiUrl(): string {
  const base = (process.env.ANTHROPIC_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
  return `${base}/v1/messages`;
}
const DEFAULT_MODEL = 'claude-haiku-5-5';
const TIMEOUT_MS = 60000;
const LONG_TIMEOUT_MS = 110000; // التأليف الطويل والبحث

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type StreamOptions = {
  /** تفعيل أداة البحث في الويب مع حد أقصى لعدد عمليات البحث */
  webSearchMaxUses?: number;
  maxTokens?: number;
  /** تفعيل الأدوات المحلية (Claude فقط) */
  tools?: boolean;
  /** صور وملفات PDF مرفقة بالرسالة */
  attachments?: Attachment[];
};

function webSearchToolType(): string {
  const t = process.env.ANTHROPIC_WEB_SEARCH_TOOL?.trim();
  return t && /^web_search_\d{8}$/.test(t) ? t : 'web_search_20250305';
}

export function llmAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown; raw: string };

function userContent(userText: string, attachments: Attachment[]): string | unknown[] {
  if (!attachments.length) return userText;
  return [
    ...attachments.map((a) =>
      a.mime === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: a.mime, data: a.data } }
        : { type: 'image', source: { type: 'base64', media_type: a.mime, data: a.data } },
    ),
    { type: 'text', text: userText },
  ];
}

// بث الرد قطعة قطعة (SSE). مع opts.tools يستدعي Claude الأدوات المحلية تلقائياً (حتى MAX_TOOL_ROUNDS جولات)
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

  const useTools = Boolean(opts.tools) && toolsEnabled() && !opts.webSearchMaxUses;
  const messages: Array<{ role: string; content: unknown }> = [
    ...history,
    { role: 'user', content: userContent(userText, opts.attachments ?? []) },
  ];
  const timeout = (opts.maxTokens ?? 0) > 3000 || opts.webSearchMaxUses || useTools || opts.attachments?.length ? LONG_TIMEOUT_MS : TIMEOUT_MS;
  const deadline = Date.now() + timeout;

  let produced = false;
  const results = new Map<string, Source>();
  const cited = new Map<string, Source>();
  const queries: string[] = [];
  const toolInput = new Map<number, string>();
  const usedTools: string[] = [];
  let paused = false;

  for (let round = 0; round <= (useTools ? MAX_TOOL_ROUNDS : 0); round++) {
    const lastRound = round === MAX_TOOL_ROUNDS;
    let res: Response;
    try {
      res = await fetch(apiUrl(), {
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
          messages,
          ...(opts.webSearchMaxUses
            ? { tools: [{ type: webSearchToolType(), name: 'web_search', max_uses: opts.webSearchMaxUses }] }
            : useTools && !lastRound
              ? { tools: TOOLS }
              : {}),
        }),
        signal: AbortSignal.timeout(Math.max(5000, deadline - Date.now())),
      });
    } catch {
      throw new Error('تعذر الوصول لخدمة الذكاء الاصطناعي، أو انتهت المهلة');
    }

    if (!res.ok) {
      throw new Error(`خدمة الذكاء الاصطناعي رجعت خطأ (${res.status})`);
    }

    const blocks = new Map<number, Block>();
    let stopReason = '';

    for await (const data of sseData(res)) {
      let evt: {
        type?: string;
        index?: number;
        content_block?: { type?: string; id?: string; name?: string; content?: unknown };
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
      if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
        blocks.set(idx, { type: 'tool_use', id: String(evt.content_block.id ?? ''), name: String(evt.content_block.name ?? ''), input: {}, raw: '' });
      } else if (evt.type === 'content_block_start' && evt.content_block?.type === 'text') {
        blocks.set(idx, { type: 'text', text: '' });
      } else if (evt.type === 'content_block_start' && evt.content_block?.type === 'server_tool_use') {
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
        const blk = blocks.get(idx);
        if (d?.type === 'text_delta' && d.text) {
          produced = true;
          if (blk?.type === 'text') blk.text += d.text;
          yield d.text;
        } else if (d?.type === 'input_json_delta' && blk?.type === 'tool_use') {
          blk.raw += d.partial_json ?? '';
        } else if (d?.type === 'input_json_delta' && toolInput.has(idx)) {
          toolInput.set(idx, (toolInput.get(idx) ?? '') + (d.partial_json ?? ''));
        } else if (d?.type === 'citations_delta') {
          addSource(cited, d.citation?.url, d.citation?.title);
        }
      } else if (evt.type === 'content_block_stop') {
        const blk = blocks.get(idx);
        if (blk?.type === 'tool_use') {
          try { blk.input = JSON.parse(blk.raw || '{}'); } catch { blk.input = {}; }
        } else if (toolInput.has(idx)) {
          try {
            const q = (JSON.parse(toolInput.get(idx) ?? '{}') as { query?: unknown }).query;
            if (typeof q === 'string' && q) queries.push(q.slice(0, 120));
          } catch {
            /* استعلام غير مفهوم */
          }
          toolInput.delete(idx);
        }
      } else if (evt.type === 'message_delta' && evt.delta?.stop_reason) {
        stopReason = evt.delta.stop_reason;
        if (stopReason === 'pause_turn') paused = true;
      }
    }

    const ordered = [...blocks.entries()].sort((x, y) => x[0] - y[0]).map(([, v]) => v);
    const calls = ordered.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
    if (!useTools || stopReason !== 'tool_use' || calls.length === 0 || lastRound) break;

    messages.push({
      role: 'assistant',
      content: ordered
        .filter((b) => b.type === 'tool_use' || b.text.length > 0)
        .map((b) => (b.type === 'text' ? { type: 'text', text: b.text } : { type: 'tool_use', id: b.id, name: b.name, input: b.input })),
    });
    messages.push({
      role: 'user',
      content: calls.map((c) => {
        if (!usedTools.includes(c.name)) usedTools.push(c.name);
        return { type: 'tool_result', tool_use_id: c.id, content: runTool(c.name, c.input) };
      }),
    });
  }
  if (!produced) {
    throw new Error('لم يصل رد من خدمة الذكاء الاصطناعي');
  }
  if (usedTools.length) yield `\n\n🔧 أدوات استُخدمت تلقائياً: ${usedTools.join('، ')}`;
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
