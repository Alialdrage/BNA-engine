// مهارات مخصصة يعرّفها المستخدم (اسم + تعليمات). تُحفظ في المتصفح، ويمكن تصديرها واستيرادها كحزمة JSON.
// ملف آمن للمتصفح والخادم.
export type CustomSkill = { id: string; name: string; icon: string; system: string };

export const MAX_CUSTOM_SKILLS = 20;
export const MAX_CUSTOM_NAME = 30;
export const MAX_CUSTOM_SYSTEM = 2000;

const clean = (s: unknown, max: number) =>
  typeof s === 'string' ? s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max) : '';

export function normalizeSkill(raw: unknown): CustomSkill | null {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const name = clean(o.name, MAX_CUSTOM_NAME).replace(/[\s/]+/g, '-');
  const system = clean(o.system, MAX_CUSTOM_SYSTEM);
  if (!name || system.length < 10) return null;
  const icon = clean(o.icon, 4) || '🧩';
  const id = clean(o.id, 40) || `c-${name}`;
  return { id, name, icon, system };
}

export function importPack(text: string): { skills: CustomSkill[] } | { error: string } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { error: 'ملف الحزمة ليس JSON صالحاً' }; }
  const list = Array.isArray(data) ? data : (data as { skills?: unknown })?.skills;
  if (!Array.isArray(list)) return { error: 'الصيغة المتوقعة: مصفوفة مهارات أو {"skills":[...]}' };
  const skills = list.slice(0, MAX_CUSTOM_SKILLS).map(normalizeSkill).filter((s): s is CustomSkill => s !== null);
  return skills.length ? { skills } : { error: 'لم أجد مهارات صالحة (يلزم name وsystem بعشرة أحرف على الأقل)' };
}

export function mergeSkills(current: CustomSkill[], incoming: CustomSkill[]): CustomSkill[] {
  const map = new Map(current.map((s) => [s.name, s]));
  for (const s of incoming) map.set(s.name, s);
  return [...map.values()].slice(0, MAX_CUSTOM_SKILLS);
}

export function exportPack(skills: CustomSkill[]): string {
  return JSON.stringify({ bna: 1, skills: skills.map(({ name, icon, system }) => ({ name, icon, system })) }, null, 2);
}
