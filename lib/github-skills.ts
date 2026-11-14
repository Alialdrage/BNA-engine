// استيراد مهارات من GitHub: ملف حزمة JSON، أو ملفات SKILL.md (صيغة مهارات Claude) من مستودع أو مجلد.
// يُستورد النص (التعليمات) فقط. لا يُنفَّذ أي كود من المستودع أبداً، والأدوات الخارجية تبقى بيد مالك الموقع.
import { MAX_CUSTOM_SKILLS, MAX_CUSTOM_SYSTEM, importPack, normalizeSkill, type CustomSkill } from './custom-skills';

export type GhRef = { owner: string; repo: string; ref?: string; path: string; isFile: boolean };

const SEG = /^[A-Za-z0-9_.-]{1,100}$/;
const MAX_FILE_BYTES = 100_000;
const FETCH = { timeout: 10_000 };

export function parseGithubUrl(input: string): GhRef | null {
  const t = input.trim();
  const short = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(t);
  if (short) return SEG.test(short[1]) && SEG.test(short[2]) ? { owner: short[1], repo: short[2].replace(/\.git$/, ''), path: '', isFile: false } : null;
  let u: URL;
  try { u = new URL(t); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.some((p) => p === '..' || p.includes('\\'))) return null;
  if (u.hostname === 'raw.githubusercontent.com') {
    const [owner, repo, ref, ...rest] = parts;
    if (!owner || !repo || !ref || rest.length === 0 || !SEG.test(owner) || !SEG.test(repo)) return null;
    return { owner, repo, ref, path: rest.join('/'), isFile: true };
  }
  if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return null;
  const [owner, repoRaw, kind, ref, ...rest] = parts;
  if (!owner || !repoRaw || !SEG.test(owner) || !SEG.test(repoRaw)) return null;
  const repo = repoRaw.replace(/\.git$/, '');
  if (kind === 'blob' && rest.length === 0) return null;
  if ((kind === 'tree' || kind === 'blob') && ref) {
    return { owner, repo, ref, path: rest.join('/'), isFile: kind === 'blob' };
  }
  return { owner, repo, path: '', isFile: false };
}

// تحليل SKILL.md: frontmatter (name, description) + المتن
export function parseSkillMd(text: string, fallbackName: string): { skill: CustomSkill; truncated: boolean } | null {
  let body = text.replace(/\r\n/g, '\n');
  let name = '';
  let description = '';
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(body);
  if (fm) {
    body = body.slice(fm[0].length);
    for (const line of fm[1].split('\n')) {
      const m = /^(name|description):\s*(.*)$/.exec(line);
      if (!m) continue;
      const v = m[2].trim().replace(/^["']|["']$/g, '');
      if (m[1] === 'name') name = v; else description = v;
    }
  }
  if (!name) {
    const h = /^#\s+(.+)$/m.exec(body);
    name = h?.[1] ?? fallbackName;
  }
  const full = `${description ? `${description}\n\n` : ''}${body.trim()}`;
  const truncated = full.length > MAX_CUSTOM_SYSTEM;
  const skill = normalizeSkill({ name: name.slice(0, 30), icon: '🐙', system: full });
  return skill ? { skill, truncated } : null;
}

type Fetcher = typeof fetch;

async function getText(url: string, f: Fetcher, apiHost: boolean): Promise<string | null> {
  const headers: Record<string, string> = { 'user-agent': 'bna-engine', accept: apiHost ? 'application/vnd.github+json' : 'text/plain' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await f(url, { headers, redirect: 'error', signal: AbortSignal.timeout(FETCH.timeout) });
    if (!res.ok) return null;
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > MAX_FILE_BYTES * 20) return null;
    return (await res.text()).slice(0, apiHost ? 2_000_000 : MAX_FILE_BYTES);
  } catch {
    return null;
  }
}

const rawUrl = (r: GhRef, path: string) =>
  `https://raw.githubusercontent.com/${r.owner}/${r.repo}/${encodeURIComponent(r.ref ?? 'HEAD')}/${path.split('/').map(encodeURIComponent).join('/')}`;

export type GhResult = { skills: CustomSkill[]; source: string; truncated: number } | { error: string };

export async function fetchGithubSkills(ref: GhRef, f: Fetcher = fetch): Promise<GhResult> {
  const source = `${ref.owner}/${ref.repo}${ref.path ? `/${ref.path}` : ''}`;

  if (ref.isFile) {
    const text = await getText(rawUrl(ref, ref.path), f, false);
    if (text === null) return { error: 'تعذر جلب الملف (تأكد أن المستودع عام والرابط صحيح)' };
    if (ref.path.toLowerCase().endsWith('.json')) {
      const r = importPack(text);
      return 'error' in r ? r : { skills: r.skills, source, truncated: 0 };
    }
    const fallback = ref.path.split('/').slice(-2, -1)[0] ?? ref.repo;
    const s = parseSkillMd(text, fallback);
    return s ? { skills: [s.skill], source, truncated: s.truncated ? 1 : 0 } : { error: 'الملف ليس مهارة صالحة (يلزم نص تعليمات كافٍ)' };
  }

  // حزمة جاهزة في الجذر/المجلد
  const prefix = ref.path ? `${ref.path.replace(/\/$/, '')}/` : '';
  const pack = await getText(rawUrl(ref, `${prefix}bna-skills.json`), f, false);
  if (pack !== null) {
    const r = importPack(pack);
    if (!('error' in r)) return { skills: r.skills, source, truncated: 0 };
  }

  // البحث عن ملفات SKILL.md في شجرة المستودع
  const tree = await getText(
    `https://api.github.com/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(ref.ref ?? 'HEAD')}?recursive=1`,
    f,
    true,
  );
  if (tree === null) return { error: 'تعذر قراءة المستودع (خاص؟ غير موجود؟ أو تجاوزت حد GitHub للطلبات، حاول لاحقاً)' };
  let paths: string[] = [];
  try {
    const t = JSON.parse(tree) as { tree?: Array<{ path?: string; type?: string; size?: number }> };
    paths = (t.tree ?? [])
      .filter((n) => n.type === 'blob' && typeof n.path === 'string' && /(^|\/)SKILL\.md$/i.test(n.path) && (n.size ?? 0) <= MAX_FILE_BYTES)
      .map((n) => n.path as string)
      .filter((p) => !prefix || p.startsWith(prefix))
      .slice(0, MAX_CUSTOM_SKILLS);
  } catch {
    return { error: 'رد غير مفهوم من GitHub' };
  }
  if (paths.length === 0) return { error: 'لم أجد bna-skills.json ولا ملفات SKILL.md في هذا المستودع/المجلد' };

  const texts = await Promise.all(paths.map((p) => getText(rawUrl(ref, p), f, false)));
  const skills: CustomSkill[] = [];
  let truncated = 0;
  texts.forEach((txt, i) => {
    if (txt === null) return;
    const s = parseSkillMd(txt, paths[i].split('/').slice(-2, -1)[0] ?? ref.repo);
    if (!s) return;
    if (!skills.some((k) => k.name === s.skill.name)) skills.push(s.skill);
    if (s.truncated) truncated++;
  });
  return skills.length ? { skills, source, truncated } : { error: 'وُجدت ملفات SKILL.md لكن لا تحتوي تعليمات صالحة' };
}
