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
console.log(bad ? `\n${bad} failed of ${n}` : `all ${n} checks passed`); process.exit(bad ? 1 : 0);
