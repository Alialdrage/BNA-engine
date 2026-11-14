import { NextResponse } from 'next/server';
import { loadExternalTools } from '@/lib/external-tools';
import { TOOLS } from '@/lib/tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// قائمة الأدوات المتاحة للاستدعاء التلقائي (أسماء ووصف فقط، بلا عناوين أو أسرار)
export async function GET() {
  return NextResponse.json({
    builtin: TOOLS.map((t) => ({ name: t.name, description: t.description })),
    external: loadExternalTools().map((t) => ({ name: t.name, description: t.description })),
  });
}
