'use client';

import { useMemo, useState } from 'react';
import { androidProject, parseProject, zipProject, type ProjectFile } from '@/lib/project';

function download(name: string, data: Uint8Array) {
  const blob = new Blob([data as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// يظهر تحت أي رد يحتوي مشروعاً (كتل === FILE ===): تنزيل ZIP أو مشروع APK
export default function ProjectDownloads({ output }: { output: string }) {
  const project = useMemo(() => parseProject(output), [output]);
  const [msg, setMsg] = useState('');
  if (!project) return null;

  const zip = (files: ProjectFile[], suffix: string) => {
    try {
      download(`${project.slug}${suffix}.zip`, zipProject(files));
      setMsg('');
    } catch {
      setMsg('تعذر إنشاء الملف');
    }
  };
  const apk = () => {
    const r = androidProject(project);
    if ('error' in r) { setMsg(r.error); return; }
    zip(r.files, '-android');
    setMsg('تم تنزيل مشروع الأندرويد. اقرأ ANDROID-README.md: ارفعه إلى GitHub ليبني لك ملف APK تلقائياً.');
  };

  return (
    <div className="mt-4 rounded-2xl border border-cyan-300/30 bg-cyan-300/5 p-3">
      <div className="text-xs text-cyan-200/70">
        📁 {project.title} — {project.files.length} ملف
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => zip(project.files, '')} className="rounded-full bg-cyan-300 px-4 py-1.5 text-sm font-black text-slate-950 hover:bg-cyan-200">
          📦 تنزيل ZIP
        </button>
        <button type="button" onClick={apk} className="rounded-full border border-cyan-300/50 px-4 py-1.5 text-sm font-bold text-cyan-100 hover:border-cyan-300">
          📱 مشروع APK (بناء تلقائي)
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-cyan-100/80">{msg}</p>}
    </div>
  );
}
