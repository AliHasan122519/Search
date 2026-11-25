// node tests/assistant-chat.mjs : سراج answers social messages kindly and still answers book questions from the real content.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const out = '/tmp/assistant-chat-test.mjs';
await build({ entryPoints: ['src/lib/assistant.ts'], bundle: true, format: 'esm', outfile: out, logLevel: 'error' });
const { Assistant, parseBooks } = await import(pathToFileURL(out).href);
const rows = (f) => JSON.parse(readFileSync(`content/${f}.json`, 'utf8')).h;
const bank = {}; for (const [c, t] of rows('assistant')) (bank[c] ??= []).push(t);
const docs = (f) => rows(f).map((r, i) => ({ id: `${f}:${i}`, src: f, text: r[1], ref: r[0], explanation: r[2], source: r[3], by: r[4], who: r[5], extra: r[6] }));
const books = [...parseBooks(docs('kutubtabir'), 'kutubtabir'), ...parseBooks(docs('kutubfiras'), 'kutubfiras'), ...parseBooks(docs('nazm'), 'nazm')];
const people = docs('muabbirun');
const bot = new Assistant({ engine: null, books, people, phrases: bank, lists: {}, loadBook: async () => null, rng: () => Math.random() });
const NOT_FOUND = /ما لقيت|لقيت لها ذكر|المراجع اللي عندي|ما طلع لي/;
let bad = 0; const check = (ok, m) => { if (!ok) { bad++; console.log('✗', m); } };
const social = ['جعلني فداك', 'جعلني الله فداك يا سراج', 'السلام عليكم', 'هلا', 'يا هلا والله', 'صباح الخير', 'مساء النور', 'شكرا', 'جزاك الله خير', 'الله يحفظك', 'ما شاء الله', 'احسنت', 'كيفك', 'السلام عليكم كيفك', 'من انت', 'وش اسمك', 'وش تقدر تسوي', 'مع السلامة', 'تصبح على خير', 'تعبان', 'غبي', 'تمام', 'هههه', 'احبك في الله', 'اسف', 'كل عام وانتم بخير', 'كم عمرك', '😂', 'hi', 'ابغى اموت'];
for (const t of social) { const r = await bot.ask(t); console.log(`«${t}» → ${r.text.slice(0, 95)}`); check(!NOT_FOUND.test(r.text) && r.text.length > 5, `social «${t}» got a not-found/empty reply: ${r.text}`); check(r.cards.length === 0, `social «${t}» returned cards`); }
// intro
const i = bot.intro(); console.log('INTRO →', i.text); check(/سراج/.test(i.text), 'intro must name سراج');
for (let k = 0; k < 12; k++) check(/سراج/.test((await bot.ask('من انت')).text), 'who must name سراج');
// the name
await bot.ask('اسمي علي'); const nm = await bot.ask('وش اسمي'); console.log('name →', nm.text); check(/علي/.test(nm.text), 'remembers the name');
// real questions keep working
const real = [['مين ابن سيرين', /ابن سيرين|سيرين/], ['كم صفحة كتاب المرقبة العليا', /صفح/], ['السلام عليكم مين ابن سيرين', /وعليكم السلام[\s\S]*سيرين/], ['هلا والله كم صفحة كتاب المرقبة العليا', /هلا|حيّاك|يا هلا[\s\S]*صفح/], ['الجو كيف اليوم', /خارج|مختص|ما أجاوب|ما اقدر/]];
for (const [t, re] of real) { const r = await bot.ask(t); console.log(`«${t}» → ${r.text.slice(0, 110)}`); check(re.test(r.text), `real «${t}» did not give the expected answer: ${r.text.slice(0, 120)}`); }
console.log(bad ? `\n${bad} failed` : '\nall assistant checks passed'); process.exit(bad ? 1 : 0);
