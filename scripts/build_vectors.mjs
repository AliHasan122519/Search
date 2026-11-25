// node scripts/build_vectors.mjs <outDir> : embeds the symbols dictionary (content/books.json) with the on-device model and writes the vectors the app searches.
//   heads.bin / heads.json : one vector per headword (3 000+): the words a user names («عقرب»)
//   entries.bin / entries.json : one vector per dictionary entry: its headword + the beginning of what the book says
import { build } from 'esbuild'; import { readFileSync, writeFileSync } from 'node:fs'; import { pathToFileURL } from 'node:url';
const out = process.argv[2] ?? 'public/ai';
await build({ entryPoints: ['src/lib/neural.ts'], bundle: true, format: 'esm', outfile: '/tmp/neural-build.mjs', logLevel: 'error' });
const { Unigram, Neural, VectorIndex } = await import(pathToFileURL('/tmp/neural-build.mjs').href);
const ort = await import('onnxruntime-web'); ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = new URL('../public/ai/', import.meta.url).pathname;
const net = await Neural.load(ort, new Unigram(JSON.parse(readFileSync('public/ai/vocab.json', 'utf8'))), readFileSync('public/ai/e5-ar.onnx'));
const rows = JSON.parse(readFileSync('content/books.json', 'utf8')).h;
const heads = new Map(); rows.forEach((r, i) => { const h = String(r[0] ?? '').trim(); if (h && h.split(/\s+/).length <= 4) { if (!heads.has(h)) heads.set(h, []); heads.get(h).push(i); } });
const names = [...heads.keys()]; const t0 = Date.now();
const hv = await net.embed(names.map((h) => 'passage: ' + h)); console.log('headwords', names.length, 'in', Math.round((Date.now() - t0) / 1000), 's');
writeFileSync(`${out}/heads.bin`, Buffer.from(VectorIndex.quantize(hv).buffer)); writeFileSync(`${out}/heads.json`, JSON.stringify(names.map((h) => [h, heads.get(h)])));
// the labelled example questions that tell a question about dreams / the books from anything else (anchors.bin: one vector each, anchors.json: its label)
{ const a = JSON.parse(readFileSync('data/assistant/anchors.json', 'utf8')); const lab = [...a.dream.map(() => 1), ...a.other.map(() => 0)]; const av = await net.embed([...a.dream, ...a.other].map((t) => 'query: ' + t));
  writeFileSync(`${out}/anchors.bin`, Buffer.from(VectorIndex.quantize(av).buffer)); writeFileSync(`${out}/anchors.json`, JSON.stringify(lab)); console.log('anchors', lab.length); }
if (process.argv.includes('--entries')) {
  const idx = []; const txt = [];
  rows.forEach((r, i) => { const h = String(r[0] ?? '').trim(); const body = String(r[1] ?? '').replace(/\s+/g, ' ').slice(0, 160); if (!h && !body) return; idx.push(i); txt.push('passage: ' + (h ? h + ': ' : '') + body); });
  const ev = []; for (let b = 0; b < txt.length; b += 512) { ev.push(...await net.embed(txt.slice(b, b + 512))); if ((b / 512) % 8 === 0) console.log('entries', b, '/', txt.length, Math.round((Date.now() - t0) / 1000), 's'); }
  writeFileSync(`${out}/entries.bin`, Buffer.from(VectorIndex.quantize(ev).buffer)); writeFileSync(`${out}/entries.json`, JSON.stringify(idx));
}
console.log('done', Math.round((Date.now() - t0) / 1000), 's');
