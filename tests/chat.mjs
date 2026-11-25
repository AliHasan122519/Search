// node tests/chat.mjs : the conversational layer (src/lib/chat.ts) must answer social messages kindly and leave real questions to the references.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
const out = '/tmp/chat-test.mjs';
await build({ entryPoints: ['src/lib/chat.ts'], bundle: true, format: 'esm', outfile: out, logLevel: 'error' });
const { smalltalk } = await import(pathToFileURL(out).href);
const social = {
  salam: ['السلام عليكم', 'السلام عليكم ورحمة الله وبركاته', 'سلام', 'السلام', 'سلام عليكم يا سراج', 'وعليكم السلام ورحمة الله'],
  greet: ['هلا', 'هلا والله', 'هلاااا', 'يا هلا ومرحبا', 'مرحبا', 'اهلين', 'حياك الله', 'هلا يا سراج', 'hi', 'hello'],
  morning: ['صباح الخير', 'صباح النور يا غالي', 'صباحو'], evening: ['مساء الخير', 'مساء النور'], night: ['تصبح على خير', 'نوم العوافي', 'بنام'],
  howare: ['كيفك', 'كيف حالك يا سراج', 'شلونك', 'وش اخبارك', 'علومك'],
  fida: ['جعلني فداك', 'جعلني الله فداك', 'فداك', 'جعلني فداك يا سراج', 'فديتك'],
  dua: ['الله يحفظك', 'الله يسلمك', 'بارك الله فيك', 'الله يوفقك', 'الله يرفع قدرك'],
  thanks: ['شكرا', 'شكراااا', 'مشكور', 'يعطيك العافية', 'الله يجزاك خير', 'جزاك الله خيرا', 'ما قصرت', 'thanks', 'تسلم'],
  praise: ['ممتاز', 'احسنت', 'ما شاء الله', 'حلو', 'كفو', 'استفدت منك', 'جوابك حلو', 'عبقري'],
  love: ['احبك', 'احبك في الله', '❤️'], sorry: ['اسف', 'سامحني', 'معليش', 'عذرا'],
  bye: ['مع السلامة', 'في امان الله', 'باي', 'الى اللقاء', 'bye'],
  who: ['من انت', 'مين انت', 'وش اسمك', 'عرفني بنفسك', 'من صنعك', 'وش تقدر تسوي', 'انت سراج', 'ايش وظيفتك', 'كيف استخدمك', 'عندي سؤال', 'ساعدني', 'انت بشر'],
  self: ['كم عمرك', 'وين تسكن', 'تحبني', 'انت ذكي', 'تتكلم انجليزي'], name_ask: ['وش اسمي', 'تعرف اسمي'],
  laugh: ['هههههه', 'ههه', '😂', 'lol'], ack: ['تمام', 'طيب', 'اوكي', 'ماشي', 'فهمت', 'لا شكرا', '👍'],
  sad: ['تعبان', 'انا زعلان', 'خايف', 'نفسيتي تعبانة', 'مكتئب', '😢'], frustrated: ['غبي', 'ما فهمت علي', 'جوابك غلط', 'ما تفهم'],
  crisis: ['ابغى اموت', 'اقتل نفسي', 'ودي انتحر'],
  latin: ['what is the weather'],
};
const notSocial = [
  'وش تفسير رؤية الماء في الحلم', 'مين ابن سيرين', 'كم صفحة كتاب المرقبة العليا', 'دوّر لي فصل الصداقة في كتاب الأخلاق والسير', 'رأيت اني اطير في السماء', 'شفت حلم مخيف وانا خايف',
  'وش فسروا الثعبان', 'ما حكم تعبير الرؤيا', 'الماء', 'حلم', 'كتاب السلام', 'وش تفسير الصباح', 'ما شاء الله في الرؤيا وش معناها', 'اي كتاب فيه الماء', 'لا تفسر لي الحلم',
  'وش الدليل من القرآن على الرؤيا', 'هل الرؤيا حق', 'قال ابن سيرين في الذهب', 'علم الفراسة وش هو', 'الفراسة في الوجه', 'حبيبي رأيت الاسد', 'تفسير حلو في المنام',
];
let bad = 0; const fail = (m) => { bad++; console.log('✗', m); };
let n = 0;
for (const [kind, list] of Object.entries(social)) for (const t of list) { n++; const r = smalltalk(t);
  if (!r || r.rest) { fail(`«${t}» should be social:${kind}, got ${JSON.stringify(r)}`); continue; }
  if (!r.intents.includes(kind)) fail(`«${t}» should include ${kind}, got ${r.intents}`); }
for (const t of notSocial) { n++; const r = smalltalk(t); if (r && !r.rest) fail(`«${t}» is a real question but was taken as social: ${JSON.stringify(r)}`); if (r && r.rest) console.log('  (prefix)', t, '→', r.intents, '|', r.rest); }
// a greeting in front of a real question keeps the question
const mixed = [['السلام عليكم وش تفسير الماء', 'salam'], ['هلا والله مين ابن سيرين', 'greet'], ['جزاك الله خير وش تفسير الثعبان', 'thanks'], ['الله يحفظك كم صفحة كتاب البدر المنير', 'dua']];
for (const [t, k] of mixed) { n++; const r = smalltalk(t); if (!r || !r.rest || r.intents[0] !== k) fail(`«${t}» should be ${k}+question, got ${JSON.stringify(r)}`); }
const nm = smalltalk('اسمي علي'); n++; if (!nm || nm.name !== 'علي') fail('name_set: ' + JSON.stringify(nm));
const combo = smalltalk('السلام عليكم كيفك'); n++; if (!combo || combo.intents.length !== 2) fail('combo: ' + JSON.stringify(combo));

// ---- how Saudis really write it: variants must be understood (stems, endings, stretched letters, intensifiers)
const variants = {
  greet: ['مرحبلي ملايين', 'مرحبلي', 'مرحبا ملايين', 'هلا بالف', 'هلا ومليون هلا', 'يا هلا بالغالي', 'هلاااا والله', 'يا مرحبا', 'مرحبا بالطيب', 'الف هلا', 'يا هلا ويا مرحبا', 'اهلين والله', 'هلا وغلا', 'هلا يا سراج', 'اهلا اهلا', 'ياهلا ومسهلا', 'حياك الله يا سراج'],
  welcome: ['رحبلي', 'رحب فيني', 'قل مرحبا', 'مرحبا بي', 'استقبلني'],
  salam: ['السلام عليكم ورحمة الله', 'سلامو عليكم', 'السلام عليكم يا سراج', 'سلام عليكم ورحمة الله وبركاته', 'السلام عليكم والرحمة'],
  howare: ['كيف حالك يا غالي', 'شلونك يا سراج', 'كيفك اليوم', 'وش اخبارك يا طيب', 'كيف الحال', 'كيفكم'],
  thanks: ['شكرا يا سراج', 'مشكور يا غالي', 'يعطيك العافيه يا سراج', 'الف شكر', 'شكرا جزيلا', 'مشكووور', 'جزاك الله خير يا سراج', 'ماقصرت يا غالي', 'تسلم يا سراج'],
  fida: ['فداك يا سراج', 'جعلني الله فداك يا سراج', 'جعلني فدا لك', 'جعلني فداااك'],
  dua: ['الله يوفقك يا سراج', 'الله يحفظك ويرعاك يا سراج', 'بارك الله فيك يا سراج', 'الله يجزاك الجنه'],
  praise: ['احسنت يا سراج', 'ما شاء الله عليك', 'كفو يا سراج', 'ممتاز يا سراج', 'يا سلام عليك', 'جوابك ممتاز'],
  bye: ['مع السلامه يا سراج', 'في امان الله يا غالي', 'الله معك', 'يلا مع السلامه'],
  night: ['تصبح على خير يا سراج', 'تصبحون على خير', 'نوم العوافي يا غالي'],
  miss: ['وينك يا سراج', 'اشتقنا لك', 'من زمان يا سراج', 'وحشتني'],
  joke: ['قل لي نكته', 'عندك نكته', 'ضحكني'], chat: ['سولف معي', 'تعال نسولف', 'وش الجديد', 'وش عندك'], wait: ['لحظه', 'ثواني', 'استنى شوي'],
  lost: ['ما ادري وش اسال', 'محتار', 'من وين ابدا', 'علمني', 'ابغى اتعلم'],
  dream_start: ['عندي حلم', 'عندي حلم ابغى تفسيره', 'ابغى تفسير حلم', 'شفت حلم', 'ابغى اعبر رويا', 'عندي رؤيا'],
  who: ['وش اسمك يا حلو', 'من انت يا سراج', 'عرفني بنفسك يا سراج', 'ايش تقدر تسوي لي'],
  ack: ['تمام يا سراج', 'ماشي يا غالي', 'اوكي تمام'],
};
for (const [kind, list] of Object.entries(variants)) for (const t of list) { n++; const r = smalltalk(t);
  if (!r || r.rest) { fail(`variant «${t}» should be ${kind}, got ${JSON.stringify(r)}`); continue; }
  if (!(r.intents.includes(kind) || (kind === 'greet' && r.intents.includes('welcome')))) fail(`variant «${t}» should include ${kind}, got ${r.intents}`); }
// ---- false positives: nothing from the real dictionaries may be taken as small talk
import { readFileSync } from 'node:fs';
const sweep = new Set();
for (const [h] of JSON.parse(readFileSync('content/books.json', 'utf8')).h) { const w = String(h).trim(); if (w && w.split(/\s+/).length <= 4) sweep.add(w); }
for (const f of ['kutubtabir', 'kutubfiras', 'nazm', 'muabbirun']) for (const r of JSON.parse(readFileSync(`content/${f}.json`, 'utf8')).h) if (r[0]) sweep.add(String(r[0]));
for (const r of JSON.parse(readFileSync('content/assistant.json', 'utf8')).h) if (r[0] === 'topic') for (const t of JSON.parse(r[1]).triggers ?? []) sweep.add(t);
const norm = (x) => x.replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^ء-ي\s]/g, ' ').replace(/\s+/g, ' ').trim();
const known = (flat) => sweepNorm.has(flat); const sweepNorm = new Set([...sweep].map(norm));
// (1) with the dictionary guard (what the app does) no headword may be taken as small talk, except the greetings themselves
const guarded = []; for (const w of sweep) { const r = smalltalk(w, known); if (r && !r.rest) guarded.push(`${w} → ${r.intents}`); }
// (2) the fuzzy second pass must add (almost) no collisions of its own
const exactOnly = new Set(); for (const w of sweep) { const r = smalltalk(w, undefined, false); if (r && !r.rest) exactOnly.add(w); }
const fuzzyOnly = []; for (const w of sweep) { if (exactOnly.has(w)) continue; const r = smalltalk(w, known); if (r && !r.rest) fuzzyOnly.push(`${w} → ${r.intents}`); }
n += sweep.size; console.log(`swept ${sweep.size} real headwords / titles / topics: ${guarded.length} taken as small talk with the guard (greetings only), ${fuzzyOnly.length} added by fuzzy matching`);
for (const h of [...guarded, ...fuzzyOnly].slice(0, 30)) console.log('  ?', h);
if (fuzzyOnly.length > 0) fail(`fuzzy matching hijacked ${fuzzyOnly.length} real headwords`);
if (guarded.filter((g) => !/→ (?:ack|salam|greet|welcome|thanks|bye|howare|dua|fida|morning|evening|night|miss|blessing)/.test(g)).length) fail('non-greeting headwords were hijacked despite the guard');
console.log(bad ? `\n${bad} failed of ${n}` : `all ${n} checks passed`); process.exit(bad ? 1 : 0);
