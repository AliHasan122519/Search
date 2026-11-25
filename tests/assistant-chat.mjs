// node tests/assistant-chat.mjs : سراج answers social messages kindly and still answers book questions from the real content.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const out = '/tmp/assistant-chat-test.mjs';
await build({ entryPoints: ['tests/_entry.ts'], bundle: true, format: 'esm', outfile: out, logLevel: 'error' });
const { Assistant, parseBooks, Engine } = await import(pathToFileURL(out).href);
const rows = (f) => JSON.parse(readFileSync(`content/${f}.json`, 'utf8')).h;
const bank = {}; for (const [c, t] of rows('assistant')) (bank[c] ??= []).push(t);
const docs = (f) => rows(f).map((r, i) => ({ id: `${f}:${i}`, src: f, text: r[1], ref: r[0], explanation: r[2], source: r[3], by: r[4], who: r[5], extra: r[6] }));
const books = [...parseBooks(docs('kutubtabir'), 'kutubtabir'), ...parseBooks(docs('kutubfiras'), 'kutubfiras'), ...parseBooks(docs('nazm'), 'nazm')];
const people = docs('muabbirun');
// the real search engine over the real symbols dictionary (what the app loads), so a dream symbol is recognised as such
const manifest = JSON.parse(readFileSync('content/manifest.json', 'utf8'));
const engine = new Engine(); const bt = manifest.tabs.find((x) => x.id === 'books');
await engine.addSource('books', docs('books'), bt.kind, { refFirst: bt.card === 'meaning', smart: bt.smart }); await engine.finalize();
const bot = new Assistant({ engine, books, people, phrases: bank, lists: {}, loadBook: async () => null, rng: () => Math.random() });
const NOT_FOUND = /ما لقيت|لقيت لها ذكر|المراجع اللي عندي|ما طلع لي/;
let bad = 0; const check = (ok, m) => { if (!ok) { bad++; console.log('✗', m); } };
const social = ['مرحبلي ملايين', 'عندي حلم', 'ما ادري وش اسال', 'وينك يا سراج', 'سولف معي', 'جعلني فداك', 'جعلني الله فداك يا سراج', 'السلام عليكم', 'هلا', 'يا هلا والله', 'صباح الخير', 'مساء النور', 'شكرا', 'جزاك الله خير', 'الله يحفظك', 'ما شاء الله', 'احسنت', 'كيفك', 'السلام عليكم كيفك', 'من انت', 'وش اسمك', 'وش تقدر تسوي', 'مع السلامة', 'تصبح على خير', 'تعبان', 'غبي', 'تمام', 'هههه', 'احبك في الله', 'اسف', 'كل عام وانتم بخير', 'كم عمرك', '😂', 'hi', 'ابغى اموت'];
for (const t of social) { const r = await bot.ask(t); console.log(`«${t}» → ${r.text.slice(0, 95)}`); check(!NOT_FOUND.test(r.text) && r.text.length > 5, `social «${t}» got a not-found/empty reply: ${r.text}`); check(r.cards.length === 0, `social «${t}» returned cards`); }
// dream symbols are questions, not feelings: «ثعبان» (not «تعبان»)، «حمار»
const sym = ['ثعبان', 'حمار', 'جمال', 'طيب'];
const SADWORDS = /الله يفرّج|لا تضيق|سلامتك يا طيب|حقّك عليّ|سامحني يا طيب/;
for (const w of sym) { const r = await bot.ask(w); console.log(`symbol «${w}» → ${r.text.slice(0, 70)}`); check(!SADWORDS.test(r.text), `symbol «${w}» was taken as an emotion: ${r.text}`); }
// intro
const i = bot.intro(); console.log('INTRO →', i.text); check(/سراج/.test(i.text), 'intro must name سراج');
for (let k = 0; k < 12; k++) check(/سراج/.test((await bot.ask('من انت')).text), 'who must name سراج');
// the name
await bot.ask('اسمي علي'); const nm = await bot.ask('وش اسمي'); console.log('name →', nm.text); check(/علي/.test(nm.text), 'remembers the name');
// real questions keep working
const real = [['وش تفسير الماء في المنام', /./], ['تفسير رؤية الذهب في المنام', /./], ['الماء في المنام', /./], ['وش تفسير الاسد في الحلم', /./], ['مين ابن سيرين', /ابن سيرين|سيرين/], ['كم صفحة كتاب المرقبة العليا', /صفح/], ['السلام عليكم مين ابن سيرين', /وعليكم السلام[\s\S]*سيرين/], ['هلا والله كم صفحة كتاب المرقبة العليا', /هلا|حيّاك|يا هلا[\s\S]*صفح/], ['الجو كيف اليوم', /خارج|مختص|ما أجاوب|ما اقدر/]];
for (const [t, re] of real) { const r = await bot.ask(t); if (/في (?:المنام|الحلم)/.test(t)) check(r.cards.length > 0, `«${t}» found nothing: ${r.text}`); console.log(`«${t}» → ${r.text.slice(0, 110)}`); check(re.test(r.text), `real «${t}» did not give the expected answer: ${r.text.slice(0, 120)}`); }
console.log(bad ? `\n${bad} failed` : '\nall assistant checks passed'); process.exit(bad ? 1 : 0);
