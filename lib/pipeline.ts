// دمج المهارات: سلسلة خطوات يغذّي ناتج كل خطوة الخطوةَ التي بعدها.
import { MAX_INPUT_LENGTH, type EngineId } from './engines';
import { stripSources } from './sources';

export const MAX_STEPS = 5;

export const PRESETS: Array<{ id: string; name: string; steps: EngineId[] }> = [
  { id: 'search-sum-tr', name: 'ابحث ← لخّص ← ترجم', steps: ['WEBSEARCH', 'SUMMARY', 'TRANSLATE'] },
  { id: 'analyze-write', name: 'حلّل ← اكتب', steps: ['DEEPANALYSIS', 'WRITER'] },
  { id: 'translate-sentiment', name: 'ترجم ← حلّل المشاعر', steps: ['TRANSLATE', 'SENTIMENT'] },
  { id: 'research-sum', name: 'بحث عميق ← تلخيص', steps: ['DEEPRESEARCH', 'SUMMARY'] },
  { id: 'clean-summary', name: 'نظّف ← لخّص ← إحصاءات', steps: ['TEXT', 'SUMMARY', 'ANALYTICS'] },
];

// مدخل الخطوة التالية: ناتج السابقة بلا قسم المصادر، مقصوصاً للحد الأقصى
export function nextInput(prevOutput: string): string {
  return stripSources(prevOutput).slice(0, MAX_INPUT_LENGTH).trim();
}

export function addStep(steps: EngineId[], id: EngineId): EngineId[] {
  return steps.length >= MAX_STEPS ? steps : [...steps, id];
}
