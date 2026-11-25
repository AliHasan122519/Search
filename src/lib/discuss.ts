/**
 * The discussion layer of the assistant («المساعد الذكي»): it tells what a message IS (a question, a narrated dream, an opinion, an objection, a request for proof …) and, for the matters of the
 * sciences of the book lists, gathers the PROOFS the app holds, in the order a scholar gives them: the Qur'an, then the Sunnah, then the rules of the interpreters, then what the books say.
 * Nothing here writes a word of knowledge: a topic (kept in the content, tab «المساعد الذكي», so it can be corrected by a content update) only says which words call it and what to look
 * for in which reference; every answer is a quotation with its place. Whether a quotation agrees with the asker is left to the asker: the assistant lays the proofs beside his words.
 */
import { normalize, tokens, queryStem } from './arabic';
import type { Doc, Lookup } from './types';

export type Tier = 'quran' | 'hadith' | 'rules' | 'books' | 'people';
export const TIER_LABEL: Record<Tier, string> = { quran: 'من القرآن الكريم', hadith: 'من السنة النبوية', rules: 'من قواعد علم التعبير', books: 'من كلام أهل العلم في الكتب', people: 'من سيرة المعبِّرين' };
export const TIER_ORDER: Tier[] = ['quran', 'hadith', 'rules', 'books', 'people'];
/** one thing to look for: in which reference (`src`: the tab or list that holds it), with which words, how many results */
export interface Ask { tier: Tier; src: string; q?: string; ref?: string; n?: number; list?: string }       // `ref`: verses by place ("12:43"); `q` = "$": the words the asker used
export interface Topic { id: string; label: string; triggers: string[]; ask: Ask[]; follow?: string[] }
export interface Evidence { tier: Tier; title: string; where: string; quote: string }
export interface Env { engine: { lookup(src: string, q: string): Lookup; has(src: string): boolean; quranAt?(s: number, a: number): Doc | undefined } | null; lists: Record<string, Doc[]> }

// ---------- words ----------
const SMALL = new Set('من في على الى عن مع ان انه هذا هذه ما هل هي هو او ثم قد لا لم لن كل بين يا'.split(' '));
const trim = (w: string): string => { for (const s of ['ات', 'ون', 'ين', 'ان', 'ه', 'ا', 'ي']) if (w.length - s.length >= 3 && w.endsWith(s)) return w.slice(0, -s.length); return w; };
export const keysOf = (w: string): string[] => { const s = queryStem(w); const t = trim(s); return t !== s ? [s, t] : [s]; };
const wordsOf = (q: string): string[] => tokens(normalize(q)).filter((w) => w.length >= 2 && !SMALL.has(w));

// ---------- searching a list of entries (the lists of the side menu are small: a plain index of the words of each entry) ----------
interface DI { keys: Set<string>[]; df: Map<string, number>; }
const dix = new WeakMap<Doc[], DI>();
function indexOf(docs: Doc[], text: (d: Doc) => string): DI {
  const hit = dix.get(docs); if (hit) return hit;
  const df = new Map<string, number>(); const keys = docs.map((d) => { const s = new Set<string>(); for (const w of tokens(normalize(text(d)))) for (const k of keysOf(w)) s.add(k); s.forEach((k) => df.set(k, (df.get(k) ?? 0) + 1)); return s; });
  const o = { keys, df }; dix.set(docs, o); return o;
}
export interface DocHit { doc: Doc; score: number; matched: string[] }
/** the entries that hold the words of `q` (every word when there are up to two, else at least `frac` of them), the best first */
export function searchDocs(docs: Doc[], q: string, limit = 3, frac = 0.75, text: (d: Doc) => string = (d) => `${d.ref ?? ''} ${d.text}`): DocHit[] {
  const ws = [...new Set(wordsOf(q))]; if (!ws.length || !docs.length) return [];
  const { keys, df } = indexOf(docs, text); const need = ws.length <= 2 ? ws.length : Math.ceil(ws.length * frac); const out: DocHit[] = [];
  keys.forEach((s, i) => {
    let got = 0, sc = 0; const m: string[] = []; const head = new Set(tokens(normalize(docs[i].ref ?? '')).flatMap(keysOf));          // a word of the entry's own title counts double
    for (const w of ws) { const ks = keysOf(w); const k = ks.find((x) => s.has(x)); if (k) { got++; sc += Math.log(1 + docs.length / (df.get(k) ?? 1)) * (ks.some((x) => head.has(x)) ? 2 : 1); m.push(...ks); } }
    if (got >= need) out.push({ doc: docs[i], score: sc * (got / ws.length) * (normalize(docs[i].ref ?? '') === normalize(q) ? 3 : 1), matched: m });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
/** a passage of `text` around the first of the words (the isnad of a hadith is left out: the quotation starts at the saying) */
export function passage(text: string, keys: string[], max = 340): string {
  let t = text.replace(/\s+/g, ' ').trim(); const ks = new Set(keys);
  const ws = t.split(' '); const wk = ws.map((w) => keysOf(normalize(w)).filter((k) => ks.has(k)));
  let at = 0, bestN = -1; for (let i = 0; i < ws.length; i++) { if (!wk[i].length) continue; const seen = new Set<string>(); for (let j = i; j < Math.min(ws.length, i + 14); j++) wk[j].forEach((k) => seen.add(k)); if (seen.size >= bestN) { bestN = seen.size; at = i; } }          // where most of the words come together
  const pos = ws.slice(0, at).join(' ').length; const q = Math.max(t.lastIndexOf('«', pos), t.lastIndexOf('"', pos)); let from = q >= 0 && pos - q < 700 ? q : -1;
  if (from < 0) { const re = /(?:قال|يقول|فقال|قالت|تقول|يقولون)\s*(?:رسول الله|النبي|رسول الله صلى الله عليه وسلم)[^:«"]{0,50}:\s*/g; let m: RegExpExecArray | null; let last = -1; while ((m = re.exec(t)) && m.index < pos) last = m.index + m[0].length; if (last >= 0 && pos - last < 700) from = last; }
  if (from >= 0) t = (from > 0 && t[from] !== '«' && t[from] !== '"' ? '… ' : '') + t.slice(from); else if (at > 14) t = '… ' + ws.slice(at - 10).join(' ');
  if (t.length <= max) return t; let s = t.slice(0, max); s = s.replace(/\s+\S*$/, ''); return s + ' …';
}
const srcOf = (d: Doc) => d.source || d.by || '';

// ---------- the proofs ----------
/** What the references hold for one `Ask`. Quotations only. (the books themselves are searched by the assistant: they are big and loaded on demand) */
export function gather(env: Env, a0: Ask, user = ''): Evidence[] {
  const a = { ...a0, q: a0.q === '$' ? user : a0.q ?? '' }; const n = a.n ?? 2; const out: Evidence[] = [];
  try {
    if (a.src === 'quran' && a.ref && env.engine?.quranAt) {
      for (const r of a.ref.split(',')) { const [s, v] = r.split(':').map(Number); const d = env.engine.quranAt(s, v); if (d) out.push({ tier: 'quran', title: `${d.surahName ?? ''} — الآية ${d.ayah ?? v}`, where: 'القرآن الكريم', quote: d.text }); }
    } else if (a.src === 'quran' && env.engine?.has('quran')) {
      for (const r of env.engine.lookup('quran', a.q).results.slice(0, n)) out.push({ tier: 'quran', title: `${r.doc.surahName ?? ''} — الآية ${r.doc.ayah ?? ''}`, where: 'القرآن الكريم', quote: r.doc.text });
    } else if (a.src === 'jami' && env.engine?.has('jami')) {
      for (const r of env.engine.lookup('jami', a.q).results.slice(0, n)) out.push({ tier: a.tier, title: 'حديث', where: `الجامع الصغير${r.doc.grade ? ' — ' + r.doc.grade : ''}`, quote: passage(r.doc.text, wordsOf(a.q).flatMap(keysOf)) });
    } else if (a.src === 'ruyahadith' && env.lists.ruyahadith) {
      for (const h of searchDocs(env.lists.ruyahadith, a.q, n, 0.75, (d) => d.text)) out.push({ tier: a.tier, title: h.doc.ref ?? 'حديث', where: `${srcOf(h.doc) || 'السنة'} — ${h.doc.ref ?? ''}`.replace(/ — $/, ''), quote: passage(h.doc.text, h.matched) });
    } else if (a.src === 'qawaid' && env.lists.qawaid) {
      for (const h of searchDocs(env.lists.qawaid, a.q, n)) {
        const lines = h.doc.text.split('\n').map((l) => l.split('\t')); const ks = new Set(h.matched); const w = wordsOf(a.q);
        const best = lines.map((l) => ({ l, s: w.filter((x) => keysOf(x).some((k) => ks.has(k) && normalize(l[0]).includes(k))).length })).sort((x, y) => y.s - x.s)[0];
        if (best) out.push({ tier: 'rules', title: h.doc.ref ?? 'قاعدة', where: `قاعدة «${h.doc.ref ?? ''}» — ${best.l[1] ?? ''}`.replace(/ — $/, ''), quote: passage(best.l[0], h.matched) });
      }
    } else if (a.src === 'anbiya' && env.lists.anbiya) {
      for (const h of searchDocs(env.lists.anbiya, a.q, n, 0.75, (d) => `${d.text} ${d.explanation ?? ''} ${d.who ?? ''}`)) out.push({ tier: a.tier, title: h.doc.who || h.doc.ref || 'رؤيا', where: h.doc.source || h.doc.by || 'رؤى الأنبياء والصالحين', quote: h.doc.text });
    } else if (a.src === 'muabbirun' && env.lists.muabbirun) {
      for (const h of searchDocs(env.lists.muabbirun, a.q, n)) out.push({ tier: 'people', title: h.doc.ref ?? '', where: h.doc.source ?? 'المعبِّرون', quote: h.doc.text.replace(/\s*\n\s*/g, '، ') });
    }
  } catch { /* the reference is not loaded yet or has nothing */ }
  return out;
}

// ---------- the topics ----------
export function parseTopics(rows: string[]): Topic[] {
  return rows.flatMap((r) => { try { const t = JSON.parse(r) as Topic; return t.id && t.label && Array.isArray(t.triggers) && Array.isArray(t.ask) ? [t] : []; } catch { return []; } });
}
/** the topic a message is about: the one whose trigger (all its words, in any order, stems and colloquial spellings tolerated) is found, the longest trigger first */
export function matchTopic(flat: string, topics: Topic[]): { topic: Topic; score: number } | null {
  const qk = new Set(tokens(flat).flatMap((w) => keysOf(w))); let best: { topic: Topic; score: number } | null = null;
  for (const t of topics) for (const tr of [...t.triggers, t.label]) {
    const ws = wordsOf(tr); if (!ws.length) continue; if (!ws.every((w) => keysOf(w).some((k) => qk.has(k)))) continue;
    const s = ws.length * 10 + ws.reduce((a, w) => a + w.length, 0) / 10; if (!best || s > best.score) best = { topic: t, score: s };
  }
  return best;
}

// ---------- what a message is ----------
export interface Intent {
  narrate: boolean; challenge: boolean; claim: boolean; ruling: boolean; why: boolean; compare: boolean; question: boolean; objection: boolean; fear: boolean;
  tier: Tier | null;                 // a kind of proof asked for («الدليل من القرآن»)
}
const Q_FIRST = /^(?:هل|كيف|ليش|ليه|لماذا|متى|وش|ايش|شو|شنو|من|منو|مين|وين|اين|كم|ماذا|ما هو|ما هي|ما معنى|ما حكم|ما الفرق|ما الدليل|ما سبب|هل من|اي|ايش|يا شيخ|سؤال)(?:\s|$)/;
const Q_ANY = /(?:^|\s)(?:هل|كيف|ليش|ليه|لماذا|متى|وش|ايش|شو|شنو|منو|مين|وين|اين|كم|ماذا)(?:\s|$)/;
const Q_WORDS = /(?:^|\s)(?:هل|كيف|ليش|ليه|لماذا|متى|وش|ايش|شو|شنو|ما|ماذا|من|منو|مين|وين|اين|كم|اي|ايه|ايهما|عندك|ممكن|تعرف|اعرف|ابغى اعرف|ابي اعرف|اسال|سؤال|استفسار|استفسر)(?:\s|$)/;
const RULING = /حكم|يجوز|جايز|حلال|حرام|مباح|مشروع|مشروعيه|بدعه|يصح|يحق|ينفع|يسوغ|مكروه|يلزم|واجب|جائز/;
const WHY = /ليش|ليه|لماذا|سبب|علاقه|ما الحكمه|الحكمه من|كيف يكون|كيف صار|كيف تكون/;
const COMPARE = /(?:ال)?فرق بين|مقارنه|ايهما|ايش احسن|وش احسن|الفرق/;
const NARR = /(?:^|\s)(?:رايت|رايتني|شفت|شفتني|حلمت|حلمنا|راى|يرى|رايتها|رايته|رايتهم)(?:\s|$)|(?:^|\s)(?:كاني|كانني|كاننا|كانه)(?:\s|$)|(?:في|بـ?ال)(?:منامي|حلمي|رويا(?:ي)?)(?:\s|$)/;
const CHALLENGE = /(?:ما|وش|ايش|اين|وين|اذكر|هات|عطني|اعطني|ابغى|ابي|ابا|اريد)\s+(?:ال)?(?:دليل|ادله|دليلك|مصدرك|برهان|برهانك|حجتك|حجه|حجج|سند|مستند|الاثبات)|(?:ال)?دليل (?:على|ذلك|هذا|من)|اثبت|اثبتلي|(?:من )?(?:وين|اين) (?:جبت|عرفت|اخذت)|من قال|بدليل|على اي اساس|كيف عرفت|كيف تثبت|مين قال|ما مصدر|وش مصدر|مصدر هذا|من اين|ما الدليل/;
const OBJECTION = /ما اقتنعت|ما اقتنع|غير مقتنع|ما اظن|ما اصدق|ما اوافق|ما اتفق|مب صحيح|مو صحيح|مب صح|غير صحيح|مو صح|ما يصح|غلط|خطا|مستحيل|كذب|هذا كلام فاضي|ما ينفع|ما اعتقد|مبالغه|ما تقنعني|لا اوافق|لا اتفق|بالعكس|ما صدقت|ما ارتحت|مو مقتنع|ما عجبني|ما اشوف|مب مقتنع|ما اقدر اصدق/;
const CLAIM = /(?:^|\s)(?:انا (?:اشوف|اظن|اعتقد|ارى|احس|اعرف|سمعت|قريت|قرات)|اشوف ان|اظن ان|اعتقد ان|في رايي|برايي|رايي|الي اعرفه|اللي اعرفه|الي اشوفه|اللي اشوفه|بحسب فهمي|حسب فهمي|يقولون ان|يقولون|يقال ان|سمعت ان|سمعت انه|قالوا ان|عندي ان|المفروض|الصحيح ان|الواقع ان|كل (?:ال)?(?:احلام|رويا|الرويا)|ما فيه|ما في|مافي|مافيه|لا يوجد|ليس هناك)(?:\s|$)/;
const FEAR = /كابوس|مزعج|مزعجه|يفزع|فزعت|مخيف|خوف|خفت|اخاف|ارهاب|مرعب|رعب|يخوف|يخيف|مكروه|كريهه|سيئه|سيء|بشعه|بشع|يضايق|اتضايق/;
const TIER = [[/قران|ايه|ايات|سوره|كتاب الله/, 'quran'], [/سنه|حديث|احاديث|نبوي|الرسول|البخاري|مسلم/, 'hadith'], [/(?:كلام|اقوال|قول) (?:ال)?(?:علماء|اهل|معبرين|مفسرين)|الكتب|العلماء|المعبرين|اهل العلم|اهل التعبير/, 'books']] as [RegExp, Tier][];
/** the kind of proof a short message asks for («من القرآن»، «السنة»، «كلام العلماء») */
export const tierOf = (flat: string): Tier | null => TIER.find(([re]) => re.test(flat))?.[1] ?? null;
export function classify(raw: string, flat: string): Intent {
  const hasQ = /[?؟]/.test(raw) || Q_FIRST.test(flat) || Q_ANY.test(flat);
  const challenge = CHALLENGE.test(flat); const ruling = RULING.test(flat); const objection = OBJECTION.test(flat);
  const tier = (flat.match(/دليل|ادله|برهان|حجه|اثبت|مصدر|اين|وين|وش|ايش|هات|عطني/) || /الدليل من|من (?:ال)?(?:قران|سنه|كتب)/.test(flat)) ? (TIER.find(([re]) => re.test(flat))?.[1] ?? null) : null;
  const narrate = NARR.test(flat) && !challenge && !ruling && !/(?:ما|وش|ايش) (?:معنى|تفسير|تعبير|تاويل)\s+(?:ال)?(?:رويا|حلم)\b/.test(flat);
  return { narrate, challenge: challenge || (tier !== null && /الدليل من|ابغى (?:الدليل|دليل)|دليل/.test(flat)), claim: CLAIM.test(flat) && !hasQ, ruling, why: WHY.test(flat), compare: COMPARE.test(flat), question: hasQ, objection, fear: FEAR.test(flat), tier };
}
