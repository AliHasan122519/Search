// node tests/understanding.mjs : the same dream questions through the assistant WITH and WITHOUT the neural understanding (public/ai); must keep the gain and never answer off-topic questions from the dictionary.
import { build } from 'esbuild'; import { readFileSync } from 'node:fs'; import { pathToFileURL } from 'node:url';
await build({ entryPoints: ['tests/_entry2.ts'], bundle: true, format: 'esm', outfile: '/tmp/eval2.mjs', logLevel: 'error' });
const { Assistant, parseBooks, Engine, Understood } = await import(pathToFileURL('/tmp/eval2.mjs').href);
const ort = await import('onnxruntime-web'); ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = new URL('../public/ai/', import.meta.url).pathname;
const AI = process.env.AI_DIR ?? 'public/ai';
const sem = await Understood.start('', ort, async (rel) => { const b = readFileSync(`${AI}/${rel.replace(/^ai\//, '')}`); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); });
if (!sem) { console.log('model did not start'); process.exit(1); }
const rows = (f) => JSON.parse(readFileSync(`content/${f}.json`, 'utf8')).h;
const bank = {}; for (const [c, t] of rows('assistant')) (bank[c] ??= []).push(t);
const docs = (f) => rows(f).map((r, i) => ({ id: `${f}:${i}`, src: f, text: r[1], ref: r[0], explanation: r[2], source: r[3], by: r[4], who: r[5], extra: r[6] }));
const manifest = JSON.parse(readFileSync('content/manifest.json', 'utf8')); const engine = new Engine(); const bt = manifest.tabs.find((x) => x.id === 'books');
await engine.addSource('books', docs('books'), bt.kind, { refFirst: true, smart: bt.smart }); await engine.finalize();
const mk = (s) => new Assistant({ engine, books: parseBooks(docs('kutubtabir'), 'kutubtabir'), people: docs('muabbirun'), phrases: bank, lists: {}, loadBook: async () => null, semantic: s });
const norm = (s) => s.replace(/[ً-ٰٟـ]/g, '').replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^ء-ي\s]/g, ' ').replace(/\s+/g, ' ').trim();
const hit = (titles, stems) => titles.some((t) => { const w = norm(t).split(' '); return stems.some((s) => w.includes(s) || w.includes('ال' + s) || norm(t) === s); });
const sets = { 'set 1': JSON.parse(readFileSync('tests/eval/queries1.json', 'utf8')), 'held-out set 2': JSON.parse(readFileSync('tests/eval/queries2.json', 'utf8')) };
const a = mk(null), b = mk(sem); let tot = { n: 0, a: 0, b: 0 }; const t0 = Date.now();
for (const [name, qs] of Object.entries(sets)) {
  let ca = 0, cb = 0; const misses = [];
  for (const [q, stems] of qs) { const ra = await a.ask(q), rb = await b.ask(q); const ha = hit(ra.cards.slice(0, 4).map((c) => c.title), stems), hb = hit(rb.cards.slice(0, 4).map((c) => c.title), stems); ca += ha; cb += hb; if (!hb) misses.push(`${q} → ${rb.cards.slice(0, 3).map((c) => c.title.slice(0, 22)).join(' | ')}`); }
  console.log(`${name}: lexical only ${ca}/${qs.length}  →  with understanding ${cb}/${qs.length}`); for (const m of misses.slice(0, 12)) console.log('   miss:', m);
  tot.n += qs.length; tot.a += ca; tot.b += cb;
}
const neg = ['كيف حالك اليوم', 'وش اخبار الجو', 'مين فاز بالمباراة', 'ما هو سعر الذهب اليوم', 'كيف اصلح السيارة', 'ابغى وصفة كبسة', 'وين اقرب مطعم', 'كم عمر الارض', 'ابي اشتري جوال جديد', 'كم يستغرق السفر من الرياض لجدة', 'علاج الم الاسنان', 'كم عدد ركعات الظهر', 'كيف اربي الاسماك في البيت', 'وش افضل وقت لزراعة الطماطم', 'كيف اربط الجوال بالتلفزيون', 'اسعار العقار في الدمام'];
let extra = 0; for (const q of neg) { const ra = await a.ask(q), rb = await b.ask(q); if (rb.cards.length > ra.cards.length) { extra++; console.log('   off-topic got dictionary cards:', q, '→', rb.cards[0]?.title.slice(0, 30)); } }
console.log(`off-topic questions that gained dictionary cards from the understanding: ${extra}/${neg.length}`);
const gain = tot.b / tot.n; console.log(`TOTAL: ${tot.a}/${tot.n} (${Math.round(100 * tot.a / tot.n)}%)  →  ${tot.b}/${tot.n} (${Math.round(100 * tot.b / tot.n)}%)   [${Math.round((Date.now() - t0) / 1000)}s]`);

if (tot.b / tot.n < 0.65 || extra > 0) { console.log('FAILED: the understanding lost its gain or answered off-topic questions'); process.exit(1); }
