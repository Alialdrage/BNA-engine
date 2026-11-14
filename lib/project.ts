// مشاريع متعددة الملفات: تحليل ناتج المحرك، تغليف ZIP، وهيكل APK (Capacitor + بناء تلقائي على GitHub Actions).
// ملف آمن للمتصفح (لا يعتمد على مكتبات الخادم).
import { strToU8, zipSync } from 'fflate';

export type ProjectFile = { path: string; content: string };
export type Project = { slug: string; title: string; files: ProjectFile[] };

export const MAX_PROJECT_FILES = 60;
const MAX_FILE_CHARS = 200_000;

export function sanitizePath(raw: string): string | null {
  const p = raw.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!p || p.startsWith('/') || /^[a-zA-Z]:/.test(p) || p.length > 150) return null;
  const parts = p.split('/');
  if (parts.some((s) => s === '' || s === '.' || s === '..' || /[\0<>:"|?*]/.test(s))) return null;
  return parts.join('/');
}

function stripFence(s: string): string {
  const m = /^\s*```[^\n]*\n([\s\S]*?)\n```\s*$/.exec(s);
  return m ? m[1] : s;
}

export function slugify(s: string): string {
  const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return slug || 'project';
}

// الصيغة: سطر "PROJECT: slug | العنوان" ثم كتل "=== FILE: path ===" ... "=== END FILE ==="
export function parseProject(text: string): Project | null {
  const files: ProjectFile[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/^=== FILE: (.+?) ===[ \t]*\n([\s\S]*?)\n=== END FILE ===/gm)) {
    const path = sanitizePath(m[1]);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    files.push({ path, content: stripFence(m[2]).slice(0, MAX_FILE_CHARS) });
    if (files.length >= MAX_PROJECT_FILES) break;
  }
  if (files.length === 0) return null;
  const head = /^PROJECT:\s*([^|\n]+?)\s*(?:\|\s*(.+))?$/m.exec(text);
  const slug = slugify(head?.[1] ?? 'project');
  const title = (head?.[2] ?? head?.[1] ?? slug).trim().slice(0, 60);
  return { slug, title, files };
}

export function zipProject(files: ProjectFile[]): Uint8Array {
  const tree: Record<string, Uint8Array> = {};
  for (const f of files) tree[f.path] = strToU8(f.content);
  return zipSync(tree, { level: 6 });
}

// ---------- APK ----------

const WORKFLOW = `name: Build Android APK
on:
  push:
    branches: [main]
  workflow_dispatch:
jobs:
  apk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17
      - run: npm install
      - run: npx cap add android
      - run: npx cap sync android
      - run: ./gradlew assembleDebug
        working-directory: android
      - uses: actions/upload-artifact@v4
        with:
          name: app-debug-apk
          path: android/app/build/outputs/apk/debug/app-debug.apk
`;

export function appIdFor(slug: string): string {
  const seg = slug.replace(/[^a-z0-9]/g, '');
  return `com.bna.${/^[a-z]/.test(seg) ? seg : `a${seg}` || 'app'}`.slice(0, 60);
}

const ANDROID_README = (title: string) => `# ${title} — مشروع أندرويد

هذا المشروع تطبيق ويب داخل غلاف Capacitor. لا يمكن بناء ملف APK داخل الموقع نفسه (يحتاج Android SDK)، لذلك أُضيف بناء تلقائي مجاني على GitHub:

1. أنشئ مستودعاً جديداً على GitHub وارفع كل ملفات هذا المجلد إليه (فرع main).
2. افتح تبويب Actions ← "Build Android APK" (يبدأ تلقائياً بعد الرفع، أو اضغط Run workflow).
3. بعد 5-10 دقائق افتح التشغيل المكتمل ونزّل الملف app-debug-apk (بداخله app-debug.apk).
4. انقله إلى هاتف أندرويد وثبّته (اسمح بالتثبيت من مصادر غير معروفة).

ملاحظات:
- الملف debug موقّع بمفتاح تجريبي: مناسب للتجربة والمشاركة، لا للنشر في Google Play (يحتاج توقيع release بمفتاحك).
- بدلاً من GitHub يمكنك بناءه محلياً: npm install ثم npx cap add android ثم npx cap open android (يتطلب Android Studio).
- كود التطبيق كله داخل المجلد www.
`;

export function androidProject(p: Project): { files: ProjectFile[] } | { error: string } {
  const byPath = new Map(p.files.map((f) => [f.path, f.content]));
  const hasWww = [...byPath.keys()].some((k) => k.startsWith('www/'));
  let files = p.files;
  if (!hasWww) {
    if (!byPath.has('index.html')) {
      return { error: 'هذا المشروع ليس تطبيق ويب (لا يوجد index.html). اطلب «تطبيق أندرويد» ليبني التطبيق داخل مجلد www.' };
    }
    const keep = /^(package\.json|README|\.|node_modules)/;
    files = p.files.map((f) => (keep.test(f.path) ? f : { ...f, path: `www/${f.path}` }));
  }
  if (!files.some((f) => f.path === 'www/index.html')) {
    return { error: 'ينقص www/index.html، اطلب من المحرك إعادة البناء.' };
  }
  const scaffold: ProjectFile[] = [
    {
      path: 'package.json',
      content: JSON.stringify(
        {
          name: p.slug, version: '1.0.0', private: true,
          dependencies: { '@capacitor/android': '^6.2.0', '@capacitor/core': '^6.2.0' },
          devDependencies: { '@capacitor/cli': '^6.2.0' },
        },
        null, 2,
      ),
    },
    { path: 'capacitor.config.json', content: JSON.stringify({ appId: appIdFor(p.slug), appName: p.title, webDir: 'www' }, null, 2) },
    { path: '.github/workflows/android-apk.yml', content: WORKFLOW },
    { path: '.gitignore', content: 'node_modules\nandroid\n' },
    { path: 'ANDROID-README.md', content: ANDROID_README(p.title) },
  ];
  const reserved = new Set(scaffold.map((f) => f.path));
  return { files: [...files.filter((f) => !reserved.has(f.path)), ...scaffold] };
}
