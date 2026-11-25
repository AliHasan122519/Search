/**
 * The assistant of the app («المساعد الذكي»): it lives entirely inside the app (no server, no key, no model download) and answers ONLY from what the app holds:
 * the books' dictionary of symbols, the full texts of the books of the two lists (read with BM25 over their paragraphs), their tables of contents and information, the interpreters,
 * the Qur'an and the Sunnah when asked for. Every answer is a quotation with its place (book, part/page, chapter) and a way to open the book there; the words around the quotation are
 * written in a Saudi colloquial voice from a bank of phrases kept in the content (the tab «assistant»), so the voice can be changed by a content update. Nothing is written from memory:
 * when the references say nothing, it says so.
 */
import { normalize, tokens, queryStem } from './arabic';
import { dialectVariants } from './dialect';
import { smalltalk, type Social } from './chat';
import type { Doc, Lookup } from './types';
import { classify, tierOf, gather, matchTopic, parseTopics, TIER_LABEL, TIER_ORDER, searchDocs, type Evidence, type Intent, type Tier, type Topic } from './discuss';

// ---------- the books ----------
export interface BookCardLite {
  kind: string; era: string; author: string; authorFull: string; coverTitle: string; inApp: boolean;
  info: [string, string][]; about: { t: string; s: string }[];
  reader: { mode: 'text'; file: string; ocr?: boolean; scan?: string } | { mode: 'embed'; id: string; manuscript?: boolean; text?: { file: string; scanId?: string } };
  toc: [number, string, number | null, (number | null)?, number?][];
}
export interface BookMeta { id: string; title: string; card: BookCardLite; list: string; textFile?: string; scanId?: string; }
export function parseBooks(docs: Doc[], list: string): BookMeta[] {
  return docs.flatMap((d) => {
    try {
      const c = JSON.parse(d.extra ?? '') as BookCardLite; if (!c?.reader || !c.toc) return [];
      const textFile = c.reader.mode === 'text' ? c.reader.file : c.reader.text?.file;
      const scanId = c.reader.mode === 'text' ? (c.reader.scan || undefined) : (c.reader.text?.scanId ?? c.reader.id) || undefined;
      return [{ id: d.id, title: d.ref ?? '', card: c, list, textFile, scanId }];
    } catch { return []; }
  });
}
export interface BookText { toc: [number, string, number, number?][]; p: string[]; pg: [number, string][]; lf?: [number, number][]; scanText?: boolean; }

// ---------- what an answer is ----------
export type Open = { kind: 'text'; book: string; para: number } | { kind: 'scan'; book: string; leaf: number | null };
export interface Card { title: string; where: string; quote: string; open: Open[]; tier?: Tier; }
export interface Reply { text: string; cards: Card[]; chips: string[]; after?: string; }
export interface Ctx {
  engine: { lookup(src: string, q: string): Lookup; has(src: string): boolean } | null;
  books: BookMeta[]; people: Doc[]; phrases: Record<string, string[]>; lists?: Record<string, Doc[]>;
  loadBook(b: BookMeta): Promise<BookText | null>;
  rng?: () => number; onStatus?: (s: string) => void;
}
export interface Memory { query: string; cards: Card[]; shown: number; topic?: Topic; narrate?: string[]; }

// ---------- words ----------
const STOP = new Set(('وش ايش شنو شو ليش لماذا كيف متى وين اين هل ما ماذا من مين منو في على الى عن مع هذا هذه هذي ذلك هذاك تلك التي الذي اللي ان انه انها كان كانت يكون تكون هو هي هم انا انت انتي نحن ' +
  'ابغى ابغا ابي ابى ابا بغيت اريد اريدك ممكن لو سمحت تعطيني اعطني عطني قل قولي قوللي قول ورني وريني ابحث دور دورلي ابحثلي بحث لقيت اعرف عرفني اعلم علمني عندك عندي يعني طيب زين الله يعطيك العافيه ' +
  'كتاب كتب ذكر ذكروا ذكرو قال قالوا قالو جاء ورد وردت كل بعض اي ايها هالموضوع موضوع شي شيء اشياء بخصوص حول تخص يخص بالنسبه خاص يا اخي ياخي والله فيه فيها فيهم عنها عنه عنهم بين بعد قبل ثم او ام اذا لو لكن بس فقط ' +
  'تفسير تفسيرها تفسيره تعبير تعبيرها تعبيره تاويل تاويلها معنى معناها معناه يدل يدلون دلاله وش ايش فسر فسروا فسرو فسرها فسره يفسرون عبر عبروا عبرو عبرها يعبرون ذكرها ذكره ذكرو قالو قالوا قالها قاله اللي الي').split(/\s+/));
const TITLE_STOP = new Set('كتاب في علم من الى على عن و ال بين'.split(' '));
const STRUCT = new Set('فهرس فهرست الفهرس فصل فصول الفصل باب ابواب الباب مقاله مقالات مبحث مباحث وحده محتويات المحتويات عناوين عنوان'.split(' ').map((w) => normalize(w)));
const dreamWords = /رؤيا|رويا|حلم|احلام|منام|شفت|رايت|حلمت/;
const GREET = new Set('سلام السلام عليكم ورحمه الله وبركاته هلا هلا والله اهلا اهلين مرحبا مرحبتين يا حياك حياكم حيا هاي صباح مساء الخير النور النورين كيفك كيف حالك حالكم شلونك علومك اخبارك وش اخبارك'.split(' ').map((w) => normalize(w)));
const THANKS = /شكرا|مشكور|يعطيك العافيه|الله يعافيك|جزاك|تسلم|يسلمو|بارك الله|ما قصرت|كفو|الله يحفظك على/;
const BYE = /مع السلامه|في امان الله|باي|الى اللقاء|بسلامه|تصبح على خير|الله يحفظك/;
const WHO = /من انت|مين انت|منو انت|وش انت|ايش انت|وش اسمك|ايش اسمك|شو اسمك|من اي|انت بشر|انت انسان|انت روبوت|انت ذكاء|انت مين|من صنعك|من برمجك/;
const HELP = /وش تسوي|ايش تسوي|وش تقدر|ايش تقدر|كيف استخدمك|كيف اسالك|مساعده|وش فايدتك|وش شغلتك|وش تعرف|ايش تعرف|وش ممكن اسالك|ايش اسالك|عرفني بنفسك|وش وظيفتك/;
const OFFTOPIC = /الجو|ميسي|رونالدو|كره القدم|كوره|ايفون|سناب|تيك توك|واجب|معادله|رياضيات|كيمياء|فيزياء|سعر|اسعار|طقس|حاله الجو|درجه الحراره|مباراه|الدوري|نتيجه المباراه|اخبار|رياضه|وصفه طبخ|طبخ|اسهم|الاسهم|عمله|دولار|بيتكوين|وظيفه|ترجم|برمجه|كود|لعبه|فلم|مسلسل|اغنيه|برج|حظك|الابراج/;
const MORE = /^(?:زدني|زيدني|زد|كمل|كمّل|كمله|اكثر|ابغى اكثر|غيره|غيرها|وغيره|وغيرها|بعد|ثاني|ثانيه|الباقي|باقي|وش بعد|والباقي)(?:\s|$)/;
const NARR_STOP = new Set(('اقول اسوي افعل اذا لو ماذا رايت شفت حلمت رايتني شفتني منام المنام حلم الحلم كاني كانني كان كنت كانت اني انني شفتها رايتها رايته شفته فيه فيها كذا ثم بعد يعني بس لقيت لقيتني حصل صار وش ايش تفسيره تفسيرها يعني ممكن').split(/\s+/).map((w) => normalize(w)));
const GEN_STOP = new Set(('اشوف اظن اعتقد رايي ارى احس كلها كل الصحيح الواقع لها ليس هناك يوجد حكم يجوز جايز حلال حرام مباح مشروع مشروعيه بدعه يصح ينفع مكروه واجب جائز فرق الفرق مقارنه سبب ليش ليه لماذا هل كيف يكون تكون صحيح خطا غلط صح').split(/\s+/).map((w) => normalize(w)));
const DOMAIN = /رويا|رؤي|حلم|احلام|منام|تعبير|تاويل|معبر|عبارات|فراسه|قيافه|مبشرات|اضغاث|اشتقاق|تفسير الاحلام|الاحلام|ابن سيرين|النابلسي|الوردي|منظومه|ارجوزه/;
const OPEN_FIRST = /^(?:افتح|افتحه|افتحها|وريني|ورني|ابغى افتحه|فتح)(?:\s|$)/;

const stems = (t: string): string[] => tokens(normalize(t)).filter((w) => w.length >= 2).map(queryStem);
const trim = (w: string): string => { for (const s of ['ات', 'ون', 'ين', 'ان', 'ه', 'ا', 'ي']) if (w.length - s.length >= 3 && w.endsWith(s)) return w.slice(0, -s.length); return w; };
const keysOf = (w: string): string[] => { const s = queryStem(w); const t = trim(s); return t !== s ? [s, t] : [s]; };

// ---------- the phrases ----------
export function pick(ctx: Ctx, cat: string, vars: Record<string, string | number> = {}): string {
  const list = ctx.phrases[cat]; if (!list?.length) return '';
  const r = (ctx.rng ?? Math.random)(); const t = list[Math.min(list.length - 1, Math.floor(r * list.length))];
  return t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

// ---------- the index of a book (BM25 over its paragraphs), built the first time the book is searched ----------
interface Index { b: BookMeta; t: BookText; post: Map<string, Uint32Array>; len: Uint16Array; avg: number; n: number; }
const built = new WeakMap<BookText, Index>();
function indexOf(b: BookMeta, t: BookText): Index {
  const hit = built.get(t); if (hit) return hit;
  const tmp = new Map<string, number[]>(); const len = new Uint16Array(t.p.length); let sum = 0;
  t.p.forEach((p, i) => {
    const ws = tokens(normalize(p)); len[i] = Math.min(65535, ws.length); sum += ws.length; const seen = new Set<string>();
    for (const w of ws) for (const k of keysOf(w)) { if (seen.has(k)) continue; seen.add(k); let a = tmp.get(k); if (!a) tmp.set(k, (a = [])); a.push(i); }
  });
  const post = new Map<string, Uint32Array>(); tmp.forEach((a, k) => post.set(k, Uint32Array.from(a)));
  const ix = { b, t, post, len, avg: sum / Math.max(1, t.p.length), n: t.p.length }; built.set(t, ix); return ix;
}

/** the place of a paragraph in its book: «ج٢ ص٤٥» / «ص١٢٣ من الملف المصوَّر», and the chapter it belongs to */
function whereIs(b: BookMeta, t: BookText, idx: number): { page: string; chapter: string } {
  let pg = ''; for (const [i, l] of t.pg) { if (i <= idx) pg = l; else break; }
  let ch = ''; for (const e of t.toc) { if (e[2] <= idx && !e[3]) ch = e[1]; else if (e[2] > idx) break; }
  if (t.scanText && pg) pg = pg.replace(/^ص/, 'صفحة ') + ' من الملف المصوَّر'; else pg = pg.replace(/^(ج\d+)\s*ص/, '$1 ص');
  return { page: pg, chapter: ch };
}
function openFor(b: BookMeta, t: BookText, idx: number): Open[] {
  const out: Open[] = [];
  if (b.textFile) out.push({ kind: 'text', book: b.id, para: idx });
  if (b.scanId) { let leaf: number | null = null; if (t.lf) for (const [i, l] of t.lf) { if (i <= idx) leaf = l; else break; } else if (b.card.reader.mode === 'text' && b.card.reader.scan) leaf = null; if (leaf !== null || t.lf) out.push({ kind: 'scan', book: b.id, leaf }); }
  return out;
}
const snippet = (text: string, keys: Set<string>, max = 300): string => {
  const ws = text.split(/\s+/); if (text.length <= max) return text;
  let at = ws.findIndex((w) => keysOf(normalize(w)).some((k) => keys.has(k))); if (at < 0) at = 0;
  let from = Math.max(0, at - 12); let s = ws.slice(from).join(' ');
  if (s.length > max) s = s.slice(0, max).replace(/\s+\S*$/, '');
  return (from > 0 ? '… ' : '') + s + (ws.slice(from).join(' ').length > s.length ? ' …' : '');
};

// ---------- the query ----------
interface Q { raw: string; norm: string; toks: string[]; content: string[]; exp: string[]; }
function parseQuery(raw: string): Q {
  const norm = normalize(raw); const toks = tokens(norm);
  const content = toks.filter((w) => !STOP.has(w) && !STOP.has(queryStem(w)) && w.length >= 2);
  let exp: string[] = [];
  try { const dv = dialectVariants(content.join(' ') || raw, true); exp = [...new Set(dv.variants.slice(1).flatMap((v) => tokens(normalize(v))))].filter((w) => !content.includes(w) && !STOP.has(w) && w.length >= 3).slice(0, 10); } catch { /* the words as typed only */ }
  return { raw, norm, toks, content, exp };
}

/** the books named in the question: a book is named when most of the words that tell it apart from the others (by their rarity among the titles) are in the question */
function namedBooks(q: Q, books: BookMeta[]): BookMeta[] {
  const df = new Map<string, number>(); const tt = books.map((b) => [...new Set(stems(b.title + ' ' + b.card.author).filter((w) => !TITLE_STOP.has(w)))]);
  tt.forEach((ws) => ws.forEach((w) => df.set(w, (df.get(w) ?? 0) + 1)));
  const qs = new Set(q.toks.flatMap((w) => keysOf(w))); const res: { b: BookMeta; s: number }[] = [];
  books.forEach((b, i) => {
    const title = [...new Set(stems(b.title).filter((w) => !TITLE_STOP.has(w)))]; if (!title.length) return;
    const idf = (w: string) => Math.log(1 + books.length / (df.get(w) ?? 1));
    const m = (w: string) => keysOf(w).some((k) => qs.has(k)); const got = title.filter(m); const tot = title.reduce((a, w) => a + idf(w), 0); const have = got.reduce((a, w) => a + idf(w), 0);
    const auth = stems(b.card.author).filter((w) => !TITLE_STOP.has(w) && w !== 'ابن' && w.length >= 3); const authHit = auth.length > 0 && auth.every(m);
    let s = tot ? have / tot : 0; if (authHit && got.length) s = Math.max(s, 0.75); else if (authHit && title.length > 2) s = Math.max(s, 0.5);
    const exact = (w: string) => q.toks.some((x) => queryStem(x) === w);                  // a word of the title spelled as in the title
    const uniq = title.filter((w) => (df.get(w) ?? 0) === 1 && w.length >= 4 && exact(w));       // a word that only this book's title holds: it names the book
    if (uniq.length) s = Math.max(s, 0.7);
    if (got.length === 1 && title.length >= 3 && !authHit && !uniq.length) s = Math.min(s, 0.4);
    if (s >= 0.6) res.push({ b, s });
    void tt[i];
  });
  res.sort((a, b) => b.s - a.s); if (!res.length) return [];
  const top = res[0].s; return res.filter((r) => r.s >= top - 0.15).map((r) => r.b).slice(0, 3);
}

// ---------- the table of contents ----------
function tocHits(q: string[], books: BookMeta[], limit = 6, frac = 0.7): { b: BookMeta; e: BookMeta['card']['toc'][number]; s: number }[] {
  const qk = q.map((w) => keysOf(w)); const out: { b: BookMeta; e: BookMeta['card']['toc'][number]; s: number }[] = [];
  for (const b of books) for (const e of b.card.toc) {
    const ts = new Set(tokens(normalize(e[1])).flatMap((w) => keysOf(w))); const got = qk.filter((ks) => ks.some((k) => ts.has(k))).length;
    if (got && got >= Math.max(1, Math.ceil(qk.length * frac))) out.push({ b, e, s: got / qk.length + (got === qk.length ? 0.5 : 0) - (e[0] - 1) * 0.02 });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, limit);
}
const tocOpen = (b: BookMeta, e: BookMeta['card']['toc'][number]): Open[] => {
  const o: Open[] = []; const para = b.card.reader.mode === 'text' ? e[2] : e[4];
  if (b.textFile && typeof para === 'number') o.push({ kind: 'text', book: b.id, para });
  if (b.card.reader.mode === 'embed' && b.scanId && e[2] !== null) o.push({ kind: 'scan', book: b.id, leaf: e[2] as number });
  return o;
};
const tocPlace = (b: BookMeta, e: BookMeta['card']['toc'][number]) => `${b.title}${e[3] ? ` — ص ${e[3]}` : ''}`;

// ---------- the answer ----------
export class Assistant {
  private mem: Memory | null = null; private userName = ''; private texts = new Map<string, Promise<BookText | null>>(); private topics: Topic[];
  constructor(private ctx: Ctx) { this.topics = parseTopics(ctx.phrases.topic ?? []); }
  private text(b: BookMeta): Promise<BookText | null> {
    if (!b.textFile) return Promise.resolve(null); let p = this.texts.get(b.id); if (!p) { p = this.ctx.loadBook(b).catch(() => null); this.texts.set(b.id, p); } return p;
  }
  private reply(text: string, cards: Card[] = [], chips: string[] = [], after = ''): Reply { return { text, cards, chips, ...(after ? { after } : {}) }; }
  private say(cat: string, vars: Record<string, string | number> = {}) { return pick(this.ctx, cat, vars); }

  /** the first thing the user sees: سراج says who he is, shortly and kindly */
  intro(): Reply { return this.reply(this.say('intro') || this.say('hello'), [], []); }

  /** words for a social message: «chat_X» (or «hello» for a greeting, «bye»), the short «pre_X» when another reply follows it */
  private social(kinds: Social[], name?: string): Reply {
    const cat = (k: Social, short: boolean) => {
      if (short && this.ctx.phrases['pre_' + k]?.length) return 'pre_' + k;
      return k === 'greet' ? 'hello' : k === 'bye' ? 'bye' : k === 'who' ? 'who' : 'chat_' + k;
    };
    if (kinds[0] === 'name_ask') return this.reply(this.userName ? this.say('chat_name_ask', { name: this.userName }) : this.say('chat_name_unknown'));
    if (kinds[0] === 'name_set' && name) this.userName = name;
    const parts = kinds.map((k, i) => this.say(cat(k, kinds.length > 1 && i === 0), { name: this.userName || name || '' })).filter(Boolean);
    const chips = kinds.some((k) => k === 'who' || k === 'greet' || k === 'salam' || k === 'howare' || k === 'ack') ? this.suggestions() : [];
    return this.reply(parts.join(' ') || this.say('hello'), [], chips);
  }

  async ask(raw: string, social = true): Promise<Reply> {
    const ctx = this.ctx;
    // a kind word is answered kindly (a greeting, thanks, a blessing, «جعلني فداك»…); a greeting before a real question is answered first, then the question
    if (social) {
      const st = smalltalk(raw);
      if (st && !st.rest) return this.social(st.intents, st.name);
      if (st && st.rest) { const pre = this.say(st.intents[0] === 'greet' ? 'pre_greet' : 'pre_' + st.intents[0]); const r = await this.ask(st.rest, false); return pre ? { ...r, text: `${pre} ${r.text}` } : r; }
    }
    const q = parseQuery(raw.trim());
    if (!q.norm) return this.reply(this.say('empty'));
    const flat = q.norm;
    // small talk
    if (BYE.test(flat) && q.content.length === 0) return this.reply(this.say('bye'));
    if (THANKS.test(flat) && q.content.length <= 1) return this.reply(this.say('thanks'));
    if (WHO.test(flat)) return this.reply(this.say('who'), [], ['وش تقدر تسوي؟']);
    if (HELP.test(flat)) return this.reply(this.say('help'), [], this.suggestions());
    if (q.toks.every((w) => GREET.has(w) || STOP.has(w) || w.length < 2)) return this.reply(this.say('hello'), [], this.suggestions());
    // follow-ups
    if (this.mem && MORE.test(flat)) return this.more();
    if (this.mem && OPEN_FIRST.test(flat) && this.mem.cards[0]) return this.reply(this.say('open_first'), this.mem.cards.slice(0, 1));
    const books = [...ctx.books]; const it0 = classify(q.raw, flat); const keepBooks = /كتاب|كتب|مرجع|مؤلف|فهرس/.test(flat);
    const named = (it0.narrate || (it0.challenge && this.mem) || (this.mem && q.toks.length <= 4 && tierOf(flat)) || matchTopic(flat, this.topics)) && !keepBooks ? [] : namedBooks(q, books);
    const hasStruct = q.toks.some((w) => STRUCT.has(w));
    // the library itself
    if (/كم (?:كتاب|مرجع)|وش (?:الكتب|المراجع)|ايش (?:الكتب|المراجع)|(?:قائمه|قايمه) (?:الكتب|المراجع)|الكتب (?:اللي|الي|الموجوده) عندك|وش عندك من كتب/.test(flat) && !named.length) return this.library();
    if (named.length) { const r = await this.aboutBook(q, named, hasStruct); if (r) return r; }
    if (hasStruct) { const r = this.tocAnswer(q, named.length ? named : books); if (r) return r; }
    // people (the interpreters)
    const who = /^(?:من|مين|منو|وش|ايش)\s+(?:هو\s+|هي\s+)?(.+)$/.exec(flat);
    if (who && ctx.people.length) { const r = this.person(who[1]); if (r) return r; }
    if (!named.length && OFFTOPIC.test(flat) && !dreamWords.test(flat)) return this.reply(this.say('outside') || this.say('nothing', { q: q.raw }), [], this.suggestions());
    if (!named.length) { const d = await this.discuss(q); if (d) return d; }
    return this.search(q, named);
  }

  private suggestions(): string[] { return ['وش فسّروا رؤية الثعبان؟', 'مين ابن سيرين؟', 'كم صفحة كتاب المرقبة العليا؟', 'دوّر لي فصل الصداقة في كتاب الأخلاق والسير']; }

  private library(): Reply {
    const t = this.ctx.books.filter((b) => b.list === 'kutubtabir').length, z = this.ctx.books.filter((b) => b.list === 'nazm').length, f = this.ctx.books.length - t - z;
    return this.reply(this.say('list_intro', { n: this.ctx.books.length, a: t, b: f, c: z }), [], this.ctx.books.slice(0, 5).map((b) => `نبذة عن ${b.title}`));
  }

  private async aboutBook(q: Q, named: BookMeta[], hasStruct: boolean): Promise<Reply | null> {
    const flat = q.norm; const names = named.map((b) => `«${b.title}»`).join(' و');
    const rest = q.content.filter((w) => !named.some((b) => stems(b.title + ' ' + b.card.author).some((x) => x === queryStem(w) || keysOf(w).includes(x))) && !STRUCT.has(w));
    if (/عدد (?:ال)?صفح|كم (?:ال)?صفح|صفحاته|كم ورقه|حجم/.test(flat)) {
      const cards = named.map((b) => { const rows = b.card.info.filter(([k]) => /صفح/.test(k)); return { title: b.title, where: 'معلومات الكتاب', quote: rows.length ? rows.map(([k, v]) => `${k}: ${v}`).join('، ') : 'ما ذُكر له عدد صفحات.', open: [] as Open[] }; });
      return this.reply(this.say('pages_intro', { book: names }), cards);
    }
    if (/مولف|كاتب|صاحب|مين الف|منو الف|من الف|مين كتب|منو كتب|من كتب/.test(flat)) {
      const cards = named.map((b) => ({ title: b.title, where: 'عن المؤلف', quote: b.card.authorFull, open: [] as Open[] }));
      return this.reply(this.say('author_intro', { book: names }), cards);
    }
    if (/تحميل|حمل|نزل/.test(flat) || /وين اقرا|كيف اقرا|اقراه|اقرا الكتاب/.test(flat)) return this.reply(this.say('download_help', { book: names }), named.map((b) => ({ title: b.title, where: 'من صفحة الكتاب', quote: 'فيها أزرار: قراءة الكتاب المصوَّر، وقراءة الكتاب المفرَّغ، وتحميل الكتاب المصوَّر، وتحميل الكتاب المفرَّغ.', open: [] as Open[] })));
    if (hasStruct || /الفصول|ابواب|فهرس|محتوي/.test(flat)) {
      let hits = rest.length ? tocHits(rest, named, 8) : [];
      const all = q.content.filter((w) => !STRUCT.has(w));
      if (!hits.length && all.length) hits = tocHits(all, named, 8, 0.5);                         // the words of the chapter may be words of the book's own title
      if (hits.length) return this.reply(this.say('toc_intro', { book: names }), hits.map((h) => ({ title: h.e[1], where: tocPlace(h.b, h.e), quote: '', open: tocOpen(h.b, h.e) })), ['زدني']);
      if (!rest.length && !hits.length) {
        const b = named[0]; const top = b.card.toc.filter((e) => e[0] === 1).slice(0, 14);
        return this.reply(this.say('toc_list', { book: `«${b.title}»` }), top.map((e) => ({ title: e[1], where: tocPlace(b, e), quote: '', open: tocOpen(b, e) })), [`ابحث في فهرس ${b.title} عن …`.replace(' عن …', '')]);
      }
      return this.reply(this.say('toc_none', { book: names }));
    }
    if (!rest.length || /نبذه|وش هو|ايش هو|عرفني|ملخص|وش يتكلم|عن ايش|وش فيه|وش موضوع|يتكلم عن/.test(flat)) {
      const b = named[0]; const a = b.card.about[0];
      const info = b.card.info.filter(([k]) => /صفح|محقق|ناشر|طبعه/.test(k)).map(([k, v]) => `${k}: ${v}`).join('، ');
      const cards: Card[] = [{ title: b.title, where: `${b.card.authorFull}${info ? ' — ' + info : ''}`, quote: a ? `${a.t} — ${a.s}` : '', open: [] }];
      return this.reply(this.say('about_intro', { book: `«${b.title}»` }), cards, [`فهرس ${b.title}`, `كم صفحة ${b.title}؟`]);
    }
    return null;                                             // a question about the content of the named book(s): searched in them
  }

  private tocAnswer(q: Q, books: BookMeta[]): Reply | null {
    const rest = q.content.filter((w) => !STRUCT.has(w)); if (!rest.length) return null;
    const hits = tocHits(rest, books, 8); if (!hits.length) return this.reply(this.say('toc_none', { book: 'الكتب' }));
    return this.reply(this.say('toc_intro', { book: 'الكتب' }), hits.map((h) => ({ title: h.e[1], where: tocPlace(h.b, h.e), quote: '', open: tocOpen(h.b, h.e) })), ['زدني']);
  }

  private person(name: string): Reply | null {
    const SKIP = new Set(['امام', 'بن', 'ابن', 'ابو', 'رضي', 'الله', 'عنه', 'عنهما', 'عليه', 'السلام', 'نبي', 'شيخ']); const nk = (t: string) => stems(t).filter((w) => !SKIP.has(w) && w.length >= 3);
    const ws = nk(name); if (!ws.length) return null;
    const hit = this.ctx.people.find((d) => { const r = new Set(nk(d.ref ?? '')); return ws.every((w) => r.has(w)); });
    if (!hit) return null;
    return this.reply(this.say('person_intro', { name: hit.ref ?? '' }), [{ title: hit.ref ?? '', where: hit.source ?? 'المعبِّرون', quote: hit.text.replace(/\s*\n\s*/g, '، '), open: [] }]);
  }

  private more(): Reply {
    const m = this.mem!; const next = m.cards.slice(m.shown, m.shown + 4);
    if (!next.length) return this.reply(this.say('more_none'));
    m.shown += next.length; return this.reply(this.say('more_intro'), next, m.shown < m.cards.length ? ['زدني'] : []);
  }

  // ---------- the discussion: proofs laid beside the asker's words (see lib/discuss.ts) ----------
  private env() { return { engine: this.ctx.engine, lists: this.ctx.lists ?? {} }; }
  private labelOf(id: string) { return this.topics.find((t) => t.id === id)?.label; }
  private menu(): string[] { return ['aqsam', 'hukm', 'makruha', 'adab'].map((i) => this.labelOf(i)).filter((x): x is string => !!x); }
  private follow(t?: Topic): string[] { return (t?.follow ?? []).map((i) => this.labelOf(i)).filter((x): x is string => !!x).slice(0, 3); }
  private toCard(e: Evidence): Card { return { title: e.title, where: e.where, quote: e.quote, open: [], tier: e.tier }; }
  /** the proofs of a topic, in the order of a scholar (Qur'an, Sunnah, the rules of the interpreters, the books); the same passage is never shown twice */
  private async evidenceOf(t: Topic, q: Q, only?: Tier): Promise<Card[]> {
    const out: Card[] = []; const seen = new Set<string>(); const user = q.content.join(' ');
    for (const a of t.ask) {
      if (only && a.tier !== only) continue;
      let ev: Card[];
      if (a.src === 'books') ev = await this.booksFor((a.q === '$' ? user : a.q ?? '').split(/\s+/).filter(Boolean), [], this.ctx.books.filter((b) => !a.list || b.list === a.list), 2, a.n ?? 2, false);
      else ev = gather(this.env(), a, user).map((e) => this.toCard(e));
      for (const c of ev) { const k = c.tier + '|' + c.title + '|' + c.quote.slice(0, 40); if (seen.has(k)) continue; seen.add(k); out.push(c); }
    }
    return out.sort((x, y) => TIER_ORDER.indexOf(x.tier!) - TIER_ORDER.indexOf(y.tier!));
  }
  private show(q: Q, cards: Card[], topic?: Topic, narrate?: string[]) { const first = cards.slice(0, 6); this.mem = { query: q.raw, cards, shown: first.length, topic, narrate }; return first; }

  private async discuss(q: Q): Promise<Reply | null> {
    const it = classify(q.raw, q.norm); const m = matchTopic(q.norm, this.topics); const topic = m?.topic;
    if (this.mem?.narrate && !topic && !it.challenge && !it.objection && q.toks.length <= 16) { const r = await this.dreamerContext(q); if (r) return r; }
    const tOnly = this.mem && q.toks.length <= 5 ? tierOf(q.norm) : null; if (tOnly && !it.challenge) return this.proof(q, { ...it, tier: tOnly }, topic);
    if (it.challenge) return this.proof(q, it, topic);
    if (it.objection && !topic && !it.ruling) return this.probe();
    if (topic) return this.onTopic(q, it, topic);
    if (it.narrate) return this.narrate(q);
    if (it.claim && !it.ruling) return this.reply(this.say('disc_claim_open'), [], this.menu());
    if (it.compare) { const ps = this.peopleIn(q); if (ps.length >= 2) return this.reply(this.say('person_intro', { name: ps.map((d) => d.ref).join(' و') }), ps.map((d) => ({ title: d.ref ?? '', where: d.source ?? 'المعبِّرون', quote: d.text.replace(/\s*\n\s*/g, '، '), open: [] as Open[] }))); }
    if (it.ruling || it.why || it.compare) return DOMAIN.test(q.norm) ? this.generic(q, it) : this.reply(this.say('disc_outside'), [], this.menu());
    return null;
  }

  /** the interpreters whose family name is in the message */
  private peopleIn(q: Q): Doc[] {
    const SKIP = new Set(['امام', 'بن', 'ابن', 'ابو', 'رضي', 'الله', 'عنه', 'عنهما', 'عليه', 'السلام', 'نبي', 'شيخ']); const have = new Set(q.toks.map(queryStem));
    return this.ctx.people.filter((d) => { const ws = stems(d.ref ?? '').filter((w) => !SKIP.has(w) && w.length >= 3); const last = ws[ws.length - 1]; return !!last && have.has(last); });
  }

  private async onTopic(q: Q, it: Intent, t: Topic): Promise<Reply> {
    const syms = it.narrate ? (await this.symbolCards(q)).cards : []; const ev = await this.evidenceOf(t, q);
    const all = [...syms, ...ev]; if (!all.length) return this.reply(this.say('disc_none'), [], this.menu());
    const cat = it.ruling ? 'disc_ruling' : it.objection ? 'disc_objection_topic' : it.claim ? 'disc_claim' : 'disc_topic';
    const first = this.show(q, all, t); const more = all.length > first.length ? ['زدني'] : [];
    return this.reply(this.say(cat, { topic: t.label }), first, [...more, ...this.follow(t)], it.claim || it.objection ? this.say('disc_claim_after') : '');
  }

  /** «وش الدليل؟»: the proofs of the topic in hand (all, or only those of the Qur'an / the Sunnah / the books when asked), else the sources of what was quoted before */
  private async proof(q: Q, it: Intent, topic?: Topic): Promise<Reply> {
    const t = topic ?? this.mem?.topic;
    if (t) {
      let cards = await this.evidenceOf(t, q, it.tier ?? undefined); let cat = it.tier ? 'disc_tier_only' : 'disc_challenge';
      if (it.tier && !cards.length) { cards = await this.evidenceOf(t, q); cat = 'disc_tier_none'; }
      if (!cards.length) return this.reply(this.say('disc_none'), [], this.menu());
      const first = this.show(q, cards, t);
      return this.reply(this.say(cat, { topic: t.label, tier: it.tier ? TIER_LABEL[it.tier] : '' }), first, [...(cards.length > first.length ? ['زدني'] : []), ...this.follow(t)]);
    }
    if (this.mem?.cards.length) {
      if (it.tier) { const r = await this.generic(parseQuery(this.mem.query), { ...it, ruling: false }, it.tier); return r ?? this.reply(this.say('disc_tier_empty', { tier: TIER_LABEL[it.tier] }), [], ['الدليل من السنة', 'كلام أهل العلم في ذلك']); }
      return this.reply(this.say('disc_challenge_prev'), this.mem.cards.slice(0, 4), ['زدني']);
    }
    return this.reply(this.say('disc_challenge_none'), [], this.menu());
  }
  private probe(): Reply {
    if (this.mem?.cards.length) return this.reply(this.say('disc_probe'), [], ['الدليل من القرآن', 'الدليل من السنة', 'كلام أهل العلم في ذلك', ...(this.mem.cards.length > this.mem.shown ? ['زدني'] : [])]);
    return this.reply(this.say('disc_probe_open'), [], this.menu());
  }

  /** a ruling / a why / a comparison / an opinion that no topic of the content names: what the Sunnah, the rules and the books hold for its words */
  private async generic(q: Q, it: Intent, only?: Tier): Promise<Reply | null> {
    const words = q.content.filter((w) => !GEN_STOP.has(w) && !GEN_STOP.has(queryStem(w))); if (!words.length) return null; const w = words.join(' ');
    const want = (t: Tier) => !only || only === t; const cards: Card[] = [];
    if (want('quran') && (only === 'quran' || /قران|ايه|ايات|سوره/.test(q.norm))) cards.push(...gather(this.env(), { tier: 'quran', src: 'quran', q: w, n: 3 }).map((e) => this.toCard(e)));
    if (want('hadith')) cards.push(...gather(this.env(), { tier: 'hadith', src: 'ruyahadith', q: w, n: 3 }).map((e) => this.toCard(e)));
    if (want('rules')) cards.push(...gather(this.env(), { tier: 'rules', src: 'qawaid', q: w, n: 2 }).map((e) => this.toCard(e)));
    if (want('books')) cards.push(...await this.booksFor(words, q.exp, this.ctx.books, 1, 4, false));
    if (!cards.length) return only ? null : (dreamWords.test(q.norm) || it.ruling ? this.reply(this.say('disc_none'), [], this.menu()) : null);
    cards.sort((x, y) => TIER_ORDER.indexOf(x.tier!) - TIER_ORDER.indexOf(y.tier!));
    const first = this.show(q, cards);
    return this.reply(this.say(it.ruling ? 'disc_generic_ruling' : 'disc_generic'), first, cards.length > first.length ? ['زدني'] : this.menu().slice(0, 3), it.claim || it.objection ? this.say('disc_claim_after') : '');
  }

  /** a narrated dream: what the books say of each thing the dreamer names (the dictionary of the symbols), then the rule that the reading depends on the dreamer's state, and a question about it */
  private async symbolCards(q: Q): Promise<{ cards: Card[]; syms: string[] }> {
    const eng = this.ctx.engine; const cards: Card[] = []; const syms: string[] = []; if (!eng?.has('books')) return { cards, syms };
    const ws = [...new Set(q.content.filter((w) => !NARR_STOP.has(w) && !NARR_STOP.has(queryStem(w)) && !dreamWords.test(w)))].sort((a, b) => b.length - a.length).slice(0, 7); const seen = new Set<string>();
    for (const w of ws) {
      if (cards.length >= 4) break;
      try { let word = w; let r = w.length > 3 && w.startsWith('و') ? eng.lookup('books', w.slice(1)).results.find((x) => x.group === 'meaning') : undefined; if (r) word = w.slice(1); else r = eng.lookup('books', w).results.find((x) => x.group === 'meaning'); if (!r || seen.has(r.doc.id)) continue; seen.add(r.doc.id); syms.push(word); cards.push({ title: r.doc.ref || word, where: r.doc.source ?? 'الكتب', quote: snippet(r.doc.text, new Set(keysOf(word))), open: [], tier: 'books' }); } catch { /* nothing for this word */ }
    }
    return { cards, syms };
  }
  private async narrate(q: Q): Promise<Reply> {
    const { cards, syms } = await this.symbolCards(q); const rule = gather(this.env(), { tier: 'rules', src: 'qawaid', q: 'الشيء الواحد يختلف باختلاف حال الرائي', n: 1 }).map((e) => this.toCard(e));
    const first = this.show(q, [...cards, ...rule], undefined, q.content);
    if (!cards.length) return this.reply(this.say(q.content.length ? 'narr_none' : 'narr_ask'), [], this.menu().slice(0, 2), '');
    return this.reply(this.say('narr_intro', { syms: syms.map((x) => `«${x}»`).join(' و') }), first, [], this.say('narr_probe'));
  }
  /** after a narrated dream the dreamer tells his state: the books' rule that counts it is quoted (the assistant does not interpret) */
  private async dreamerContext(q: Q): Promise<Reply | null> {
    const f = q.norm; const asks: string[] = [];
    if (/متزوج|اعزب|عزباء|متزوجه|مطلق|ارمل|حامل|صغير|كبير|شاب|بنت|ولد|اب |ام /.test(f)) asks.push('الشيء الواحد يختلف باختلاف حال الرائي');
    if (/تاجر|معلم|طبيب|مهندس|جندي|عسكري|طالب|موظف|مزارع|اشتغل|وظيفتي|مهنتي|شغلي|نجار|حداد|سائق|محاسب|خياط|اعمل|اعمل في|عاطل/.test(f)) asks.push('اختلاف التأويل باختلاف الصنعة والمعيشة');
    if (/مريض|مرض|تعبان|حمى|اشتكي|عليل/.test(f)) asks.push('اختلاف التأويل باختلاف المرض');
    if (/صيف|شتاء|ربيع|خريف|الفجر|السحر|الليل|الظهر|العصر|المغرب|العشاء|الصبح|النهار|نهارا|ليلا/.test(f)) asks.push('اختلاف التأويل باختلاف الزمان والفصول', 'التعبير بالوقت');
    if (/مسافر|غربه|بلدي|اهل بلدي|بالخارج/.test(f)) asks.push('اختلاف التأويل باختلاف المكان والبلد');
    if (/مسلم|نصراني|مسيحي|يهودي|ديني|ملتزم/.test(f)) asks.push('اختلاف التأويل باختلاف الدين والعادة');
    if (!asks.length) return null;
    const cards = [...new Map(asks.flatMap((a) => gather(this.env(), { tier: 'rules', src: 'qawaid', q: a, n: 1 }).map((e) => this.toCard(e))).map((c) => [c.title, c])).values()].slice(0, 3);
    if (!cards.length) return null;
    return this.reply(this.say('disc_ctx'), cards, this.menu().slice(0, 2));
  }

  /** the passages of the books that hold the words (BM25 over the paragraphs of the books' texts, opened on first use); at most `per` of one book, `limit` in all */
  private async booksFor(words: string[], exp: string[], pool: BookMeta[], per: number, limit: number, skipInApp: boolean): Promise<Card[]> {
    const ctx = this.ctx; words = words.flatMap((w) => tokens(normalize(w))); exp = exp.flatMap((w) => tokens(normalize(w))); const fresh = pool.filter((b) => b.textFile && !this.texts.has(b.id)).length;
    if (fresh > 3) ctx.onStatus?.(this.say('loading'));
    const texts = await Promise.all(pool.map(async (b) => [b, await this.text(b)] as const));
    const qk = words.map((w) => keysOf(w)); const ek = exp.map((w) => keysOf(w)); const keySet = new Set([...qk, ...ek].flat());
    const cand: { b: BookMeta; t: BookText; i: number; s: number }[] = [];
    if (!qk.length) return [];
    for (const [b, t] of texts) {
      if (!t) continue; if (skipInApp && b.card.inApp) continue;                    // the dictionary above already holds what the books of the tab say
      const ix = indexOf(b, t); const N = ix.n; const score = new Map<number, { s: number; hit: number }>();
      const add = (keys: string[], w: number, orig: boolean) => {
        let best: Uint32Array | undefined; for (const k of keys) { const p = ix.post.get(k); if (p && (!best || p.length > best.length)) best = p; }
        if (!best) return; const idf = Math.log(1 + (N - best.length + 0.5) / (best.length + 0.5));
        for (const i of best) { const tf = 1; const norm = 1.2 * (0.25 + 0.75 * (ix.len[i] / ix.avg)); const sc = w * idf * (tf * 2.2) / (tf + norm); const o = score.get(i) ?? { s: 0, hit: 0 }; o.s += sc; if (orig) o.hit++; score.set(i, o); }
      };
      qk.forEach((k) => add(k, 1, true)); ek.forEach((k) => add(k, 0.45, false));
      const need = qk.length <= 2 ? qk.length : Math.ceil(qk.length * 0.7);
      for (const [i, o] of score) {
        if (o.hit < need) continue; const len = ix.len[i]; if (len < 6) continue;
        let s = o.s * (o.hit / qk.length) ** 1.5; if (len > 400) s *= 0.8;
        if (normalize(t.p[i]).includes(words.join(' '))) s *= 1.35;                                                          // the words together, as asked
        cand.push({ b, t, i, s });
      }
    }
    cand.sort((a, b) => b.s - a.s);
    const cnt = new Map<string, number>(); const picked: typeof cand = []; const seen = new Set<string>();
    for (const c of cand) {
      const n = cnt.get(c.b.id) ?? 0; if (n >= per) continue; const sig = normalize(c.t.p[c.i]).slice(0, 60); if (seen.has(sig)) continue;
      seen.add(sig); cnt.set(c.b.id, n + 1); picked.push(c); if (picked.length >= limit) break;
    }
    return picked.map((c) => { const w = whereIs(c.b, c.t, c.i); return { title: c.b.title, where: [w.page, w.chapter && `باب/فصل: ${w.chapter}`].filter(Boolean).join(' — ') || 'نص الكتاب', quote: snippet(c.t.p[c.i], keySet), open: openFor(c.b, c.t, c.i), tier: 'books' as Tier }; });
  }

  private async search(q: Q, named: BookMeta[]): Promise<Reply> {
    const ctx = this.ctx; const words = q.content; const flat = q.norm;
    if (!words.length) return this.reply(this.say('empty'));
    const wantQuran = /قران|ايه|ايات|سوره/.test(flat); const wantHadith = /حديث|احاديث|السنه|النبي|رسول/.test(flat);
    const cards: Card[] = []; let intro = 'found_intro';
    const isDream = dreamWords.test(flat) || !(wantQuran || wantHadith);
    const sym = words.filter((w) => !dreamWords.test(w)).join(' ') || words.join(' ');
    // 1) the dictionary of the symbols of the books tab
    if (isDream && !named.length && ctx.engine?.has('books')) {
      try {
        let mean = ctx.engine.lookup('books', sym).results.filter((r) => r.group === 'meaning').slice(0, 4);
        if (!mean.length && sym.includes(' ')) for (const w of [...sym.split(' ')].sort((a, b) => b.length - a.length)) { mean = ctx.engine.lookup('books', w).results.filter((r) => r.group === 'meaning').slice(0, 4); if (mean.length) break; }
        for (const r of mean) cards.push({ title: r.doc.ref || sym, where: r.doc.source ?? 'الكتب', quote: snippet(r.doc.text, new Set(words.flatMap(keysOf))), open: [] });
      } catch { /* the engine has nothing for it */ }
    }
    if (wantQuran && ctx.engine?.has('quran')) { try { const lk = ctx.engine.lookup('quran', sym); for (const r of lk.results.slice(0, 3)) cards.push({ title: `${r.doc.surahName ?? ''} — آية ${r.doc.ayah ?? ''}`, where: 'القرآن الكريم', quote: r.doc.text, open: [] }); } catch { /* none */ } }
    if (wantHadith && ctx.engine?.has('jami')) { try { const lk = ctx.engine.lookup('jami', sym); for (const r of lk.results.slice(0, 3)) cards.push({ title: 'حديث', where: `السنة النبوية${r.doc.grade ? ' — ' + r.doc.grade : ''}`, quote: snippet(r.doc.text, new Set(words.flatMap(keysOf))), open: [] }); } catch { /* none */ } }
    // 2) the full texts of the books of the lists (the named books only when the question names them)
    cards.push(...await this.booksFor(words, q.exp, named.length ? named : ctx.books, named.length ? 6 : 2, 12, !named.length && cards.length > 0));
    if (!cards.length) { this.mem = null; const vague = q.toks.length <= 3 && !/[؟?]/.test(q.raw) && !/^(?:وش|ايش|شو|مين|منو|كم|هل|ليش|كيف|وين|متى|لماذا|ماذا)\b/.test(q.norm); return this.reply(vague && this.ctx.phrases.clarify?.length ? this.say('clarify') : this.say('nothing', { q: q.raw }), [], vague ? this.suggestions() : []); }
    const first = cards.slice(0, 4); this.mem = { query: q.raw, cards, shown: first.length };
    if (cards.length === 1) intro = 'found_one';
    const dreamy = isDream && !named.length;
    const extra = dreamy ? ' ' + this.say('caution_dream') : '';
    return this.reply(this.say(intro) + extra, first, cards.length > first.length ? ['زدني'] : []);
  }
}
