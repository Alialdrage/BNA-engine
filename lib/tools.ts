// أدوات محلية يستدعيها Claude تلقائياً أثناء الرد (tool use). تعمل على الخادم فقط وبلا شبكة.
import { calc, dateTool, jsonTool } from './skills';
import { writingCheck } from './writing';
import { externalToolDefs, loadExternalTools, runExternalTool } from './external-tools';

export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };

const str = (description: string) => ({ type: 'object', properties: { input: { type: 'string', description } }, required: ['input'] });

export const TOOLS: ToolDef[] = [
  {
    name: 'calculate',
    description: 'يحسب تعبيراً رياضياً (+ - * / ^ وأقواس؛ النسبة تُكتب مثل 2400*15/100، ولا تدعم كلمات عربية) أو يحوّل وحدات. استخدمه لأي حساب بدل الحساب الذهني. سطر لكل عملية.',
    input_schema: str('التعبير أو التحويل، مثل: 2400*15/100 أو 5 km to mile'),
  },
  {
    name: 'date_info',
    description: 'يعطي تاريخ اليوم (بتوقيت بغداد) بالميلادي والهجري، ويحسب الفرق بين تواريخ. استخدمه لأي سؤال عن التاريخ أو المدة.',
    input_schema: str('مثل: اليوم، أو 2026-12-31 اليوم'),
  },
  {
    name: 'format_json',
    description: 'يتحقق من JSON وينسقه ويبلغ عن الأخطاء.',
    input_schema: str('نص JSON'),
  },
  {
    name: 'writing_check',
    description: 'يفحص نصاً عربياً: عبارات جاهزة، حشو، تكرار، طول الجمل. استخدمه عند طلب تحسين نص.',
    input_schema: str('النص المراد فحصه'),
  },
];

// سجل الأدوات: لإضافة أداة محلية جديدة أضف تعريفها في TOOLS وحالتها في runTool.
// الأدوات الخارجية تأتي من EXTERNAL_TOOLS (انظر lib/external-tools.ts).
export function allTools(): ToolDef[] {
  return [...TOOLS, ...externalToolDefs()];
}

export const MAX_TOOL_ROUNDS = 4;

export function toolsEnabled(): boolean {
  return (process.env.TOOLS ?? 'on').toLowerCase() !== 'off';
}

export async function runTool(name: string, input: unknown): Promise<string> {
  const text = typeof input === 'object' && input !== null && typeof (input as { input?: unknown }).input === 'string'
    ? (input as { input: string }).input.slice(0, 5000)
    : '';
  if (!text) return 'مدخل فارغ';
  try {
    switch (name) {
      case 'calculate': return calc(text).join('\n');
      case 'date_info': return dateTool(text).join('\n');
      case 'format_json': return jsonTool(text).join('\n');
      case 'writing_check': return writingCheck(text).join('\n');
      default: return (await runExternalTool(name, text)) ?? 'أداة غير معروفة';
    }
  } catch {
    return 'تعذر تنفيذ الأداة';
  }
}
