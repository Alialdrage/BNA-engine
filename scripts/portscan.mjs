#!/usr/bin/env node
// فاحص منافذ TCP بسيط يعمل من جهازك (connect فقط). للأصول التي تملكها أو لديك تفويض بفحصها.
// الاستخدام: node scripts/portscan.mjs --authorized <host> [22,80,443 | 1-1024 | top]
import { connect } from 'node:net';

const args = process.argv.slice(2);
if (!args.includes('--authorized')) {
  console.error('أضف --authorized لتؤكد أنك تملك الهدف أو لديك تفويض كتابي بفحصه.');
  process.exit(2);
}
const [host, spec = 'top'] = args.filter((a) => a !== '--authorized');
if (!host) { console.error('الاستخدام: node scripts/portscan.mjs --authorized <host> [المنافذ]'); process.exit(2); }

const TOP = [21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 993, 995, 1433, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 9200, 27017];
let ports = TOP;
if (spec !== 'top') {
  const set = new Set();
  for (const part of spec.split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) { console.error(`منافذ غير صالحة: ${part}`); process.exit(2); }
    const a = Number(m[1]), b = Number(m[2] ?? m[1]);
    if (a < 1 || b > 65535 || b < a) { console.error('نطاق غير صالح'); process.exit(2); }
    for (let p = a; p <= b; p++) set.add(p);
  }
  ports = [...set];
}

const probe = (port) => new Promise((resolve) => {
  const s = connect({ host, port });
  const done = (r) => { s.destroy(); resolve(r); };
  s.setTimeout(2000, () => done('filtered'));
  s.once('connect', () => done('open'));
  s.once('error', (e) => done(e.code === 'ECONNREFUSED' ? 'closed' : 'filtered'));
});

const open = [];
const queue = [...ports];
await Promise.all(Array.from({ length: 50 }, async () => {
  for (let p = queue.shift(); p !== undefined; p = queue.shift()) if ((await probe(p)) === 'open') open.push(p);
}));
console.log(`${host}: ${open.length ? `مفتوحة: ${open.sort((a, b) => a - b).join(', ')}` : 'لا منافذ مفتوحة بين المفحوصة'} (من ${ports.length})`);
