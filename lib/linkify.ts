// يحوّل نص الرد إلى أجزاء: نص، صورة داخلية، أو رابط حيّ. الروابط http/https فقط.
import { safeUrl } from './sources';

export type Piece =
  | { t: 'text'; text: string }
  | { t: 'image'; alt: string; src: string }
  | { t: 'link'; label: string; url: string };

// 1: صورة داخلية  2-3: ![alt](/api/image?...)   4-5: [نص](رابط)   6: رابط مجرد
const TOKEN =
  /(!\[([^\]]*)\]\((\/api\/image\?[^)\s]+)\))|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s<>"'`]+)/g;

const TRAILING = /[.,;:!?؟،؛)\]}»”’]+$/;

export function linkify(text: string): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  const push = (t: string) => t && out.push({ t: 'text', text: t });

  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    push(text.slice(last, start));
    last = start + m[0].length;

    if (m[1]) {
      out.push({ t: 'image', alt: m[2], src: m[3] });
    } else if (m[4]) {
      const url = safeUrl(m[6]);
      if (url) out.push({ t: 'link', label: m[5], url });
      else push(m[0]);
    } else {
      // رابط مجرد: نفصل علامات الترقيم الملتصقة به في آخر الجملة
      let raw = m[7];
      const tail = TRAILING.exec(raw)?.[0] ?? '';
      raw = raw.slice(0, raw.length - tail.length);
      const url = safeUrl(raw);
      if (url) {
        out.push({ t: 'link', label: raw, url });
        push(tail);
      } else {
        push(m[0]);
      }
    }
  }
  push(text.slice(last));
  return out;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
