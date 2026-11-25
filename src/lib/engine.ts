import { normalize, normalizeB, tokens, stemKeys, queryKeys, queryStem, approxRoot, hasMarks, stripTatweel, CLITICS, refTextMatch } from './arabic';
import { relatedFor } from './semantic';
import { dialectVariants } from './dialect';
import type { Doc, Hit, Kind, Lookup, MatchType, SearchResult, SourceId } from './types';

interface Idx {
  src: SourceId; docs: Doc[]; norm: string[]; normB: (string | null)[];
  post: Map<string, number[]>;            // normalised word -> doc indexes (sorted, unique)
}
export interface Options { sources: Set<SourceId>; expand: 'off' | 'auto' | 'always'; }
const MAX_RESULTS = 80;            // same cap as the original site

/** Literal comparison form: the typed sukun (ْ) and the Uthmani sukun (ۡ) are one sign, tatweel is ignored, and the order of
 *  stacked marks is canonical (shadda+fatha == fatha+shadda). Letters are never changed. */
const MARK_RUN = /[\u064B-\u065F\u0670\u06D6-\u06ED]{2,}/g;
const unify = (t: string) => t.replace(/\u06E1/g, '\u0652').replace(/\u0640/g, '').replace(MARK_RUN, (m) => [...m].sort().join(''));
const KIND_WEIGHT: Record<Kind, number> = { quran: 40, hadith: 0, poem: 0, generic: 0 };
const yieldUI = () => new Promise<void>((r) => setTimeout(r, 0));

export class Engine {
  private idx = new Map<SourceId, Idx>();
  private kinds = new Map<SourceId, Kind>();
  private smart = new Map<SourceId, 'dialect' | 'full'>();            // tabs that understand colloquial words (and, «full», synonyms)
  private caps = new Map<SourceId, number>();
  private refFirst = new Set<SourceId>();           // tabs whose entries are ranked first when the searched word is in the entry's heading (the symbol)
  private skel = new Map<string, Set<string>>();   // stem/skeleton key -> vocabulary words
  private vocab = new Map<string, number>();       // word -> document frequency (all sources)
  private fresh: string[] = [];                  // words that entered the vocabulary since the last finalize()
  private sorted: string[] = [];
  private byId = new Map<string, Doc>();
  private quranByRef = new Map<string, Doc>();

  getDoc(id: string) { return this.byId.get(id); }
  quranAt(s: number, a: number) { return this.quranByRef.get(`${s}:${a}`); }
  docsOf(src: SourceId) { return this.idx.get(src)?.docs ?? []; }

  /** Build the index for one source. Yields to the UI every few thousand documents. */
  async addSource(src: SourceId, docs: Doc[], kind: Kind, opts?: { refFirst?: boolean; smart?: 'dialect' | 'full'; cap?: number }) {
    this.kinds.set(src, kind); if (opts?.refFirst) this.refFirst.add(src); if (opts?.smart) this.smart.set(src, opts.smart); if (opts?.cap) this.caps.set(src, opts.cap);
    const isQ = kind === 'quran';
    const ix: Idx = { src, docs, norm: new Array(docs.length), normB: new Array(docs.length), post: new Map() };
    for (let i = 0; i < docs.length; i++) {
      const d = docs[i]; this.byId.set(d.id, d);
      if (isQ) this.quranByRef.set(`${d.surah}:${d.ayah}`, d);
      const a = normalize(d.text); ix.norm[i] = a;
      let b: string | null = null;
      if (isQ) { const nb = normalizeB(d.text); if (nb !== a) b = nb; }
      ix.normB[i] = b;
      const seen = new Set<string>();
      for (const w of tokens(a)) { seen.add(w); if (kind === 'hadith' && w.length > 3 && w.endsWith('ء')) seen.add(w.slice(0, -1)); } // OCR reads the Arabic comma as a trailing ء
      if (b) for (const w of tokens(b)) seen.add(w);
      for (const w of seen) { const l = ix.post.get(w); if (l) l.push(i); else ix.post.set(w, [i]); }
      if (i % 2500 === 2499) await yieldUI();
    }
    this.idx.set(src, ix);
    for (const [w, l] of ix.post) {
      const n = this.vocab.get(w); if (n === undefined) this.fresh.push(w);
      this.vocab.set(w, (n ?? 0) + l.length);
    }
    await yieldUI();
  }
  /** Call once after all sources are added. */
  async finalize() {
    if (this.fresh.length) {                       // incremental: only the words the last source brought (the index of the earlier ones is kept)
      for (const w of this.fresh) for (const k of stemKeys(w)) { let s = this.skel.get(k); if (!s) this.skel.set(k, (s = new Set())); s.add(w); }
      this.sorted = [...this.vocab.keys()].sort(); this.fresh = [];
    }
    await yieldUI();
  }
  has(src: SourceId) { return this.idx.has(src); }

  // ----- helpers --------------------------------------------------------------------------------------
  /** vocabulary words derivationally linked to a query word (asymmetric stem / skeleton lookup), including the word itself */
  private derivedWords(w: string): Set<string> {
    const out = new Set<string>(); if (this.vocab.has(w)) out.add(w);
    for (const k of queryKeys(w)) { const s = this.skel.get(k); if (s && s.size < 800) for (const x of s) out.add(x); }
    return out;
  }
  /** the word as typed (and its Uthmani variant) plus the same word with attached clitic particles (و/ف/ب/ك/ل/ال…).
   *  The article is NOT removed from the query: like the original site, «الصبر» is looked up as typed. */
  private exactForms(w: string): Set<string> {
    const out = new Set<string>();
    for (const base of new Set([w, normalizeB(w)])) {
      if (this.vocab.has(base)) out.add(base);
      for (const c of CLITICS) { const f = c + base; if (this.vocab.has(f)) out.add(f); }
    }
    return out;
  }
  private union(ix: Idx, words: Iterable<string>): Set<number> {
    const out = new Set<number>(); for (const w of words) { const l = ix.post.get(w); if (l) for (const i of l) out.add(i); } return out;
  }
  private intersect(sets: Set<number>[]): Set<number> {
    if (!sets.length) return new Set();
    sets = [...sets].sort((a, b) => a.size - b.size);
    const out = new Set<number>();
    for (const i of sets[0]) { let ok = true; for (let k = 1; k < sets.length; k++) if (!sets[k].has(i)) { ok = false; break; } if (ok) out.add(i); }
    return out;
  }
  private hasPhrase(ix: Idx, i: number, phrase: string): boolean {
    const p = ` ${phrase} `;
    if (` ${ix.norm[i]} `.includes(p)) return true;
    const b = ix.normB[i]; return !!b && ` ${b} `.includes(p);
  }

  suggest(prefix: string, limit = 8): string[] {
    const toks = tokens(normalize(prefix)); if (!toks.length) return [];
    const last = toks[toks.length - 1]; const head = toks.slice(0, -1).join(' ');
    let lo = 0, hi = this.sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.sorted[m] < last) lo = m + 1; else hi = m; }
    const cands: [string, number][] = [];
    for (let i = lo; i < this.sorted.length && this.sorted[i].startsWith(last) && cands.length < 400; i++) {
      const w = this.sorted[i]; if (w.length < 2) continue; cands.push([w, this.vocab.get(w) ?? 0]);
    }
    cands.sort((a, b) => b[1] - a[1]);
    return cands.filter(([w]) => w !== last || cands.length === 1).slice(0, limit).map(([w]) => (head ? head + ' ' : '') + w);
  }

  // ----- main search ----------------------------------------------------------------------------------
  search(raw: string, opt: Options): SearchResult {
    const t0 = performance.now();
    const query = stripTatweel(raw.trim());
    const nq = normalize(query); const terms = tokens(nq);
    const empty: SearchResult = { query, hits: [], terms, root: '', related: [], highlight: new Set(), ms: 0 };
    if (!terms.length) return empty;
    const literal = hasMarks(query) ? unify(query).replace(/\s+/g, ' ') : '';
        // exact forms per term (A and B spellings of the query term), derivational neighbours
    const exactSets = terms.map((t) => this.exactForms(t));
    const textSets = terms.map((t, k) => { const set = new Set(exactSets[k]); for (const w of this.vocab.keys()) if (!set.has(w) && refTextMatch(w, t)) set.add(w); return set; });
    const derivedSets = terms.map((t) => this.derivedWords(t));
    const highlight = new Set<string>(); for (const s of textSets) for (const w of s) highlight.add(w); for (const s of derivedSets) for (const w of s) highlight.add(w);
    const hits: Hit[] = [];
    const phrase = terms.join(' ');
    const root = terms.length === 1 ? approxRoot(terms[0]) : '';

    for (const src of opt.sources) {
      const ix = this.idx.get(src); if (!ix) continue;
      const exactPer = terms.map((_, k) => this.union(ix, exactSets[k]));
      const derivedPer = terms.map((_, k) => this.union(ix, derivedSets[k]));
      const textPer = terms.map((_, k) => this.union(ix, textSets[k]));
      const exactDocs = this.intersect(exactPer);
      const textDocs = this.intersect(textPer);
      const derivedDocs = this.intersect(derivedPer);
      const all = new Set<number>([...derivedDocs, ...textDocs]);
      for (const i of all) {
        const d = ix.docs[i]; let type: MatchType; let score: number;
        const isExact = exactDocs.has(i);
        if (literal && unify(d.text).includes(literal)) { type = 'literal'; score = 1000; }
        else if (isExact) { type = 'normalized'; score = 600 + (terms.length > 1 && this.hasPhrase(ix, i, phrase) ? 150 : 0); }
        else if (textDocs.has(i)) { type = 'textual'; score = 450; }
        else { type = 'derived'; score = 300; }
        score += Math.max(0, 60 - ix.norm[i].length / 12);        // shorter texts that contain the term rank a little higher
        score += KIND_WEIGHT[this.kinds.get(src) ?? 'generic'];                                   // on ties: the Qur'an first
        let via: string | undefined;
        if (type === 'derived') { for (const w of tokens(ix.norm[i])) if (derivedSets[0].has(w)) { via = w; break; } }
        hits.push({ id: d.id, src, ord: i, score, type, via });
      }
    }
    // ----- optional semantic expansion (curated lists), only for single-term queries and few direct results
    let related: string[] = [];
    if (opt.expand !== 'off' && terms.length === 1 && (opt.expand === 'always' || hits.length < 8)) {
      const keys = [terms[0], queryStem(terms[0])];
      for (const k of keys) { const r = relatedFor(k); if (r.length) { related = r; break; } }
      if (related.length) {
        const seen = new Set(hits.map((h) => h.id));
        for (const src of opt.sources) {
          const ix = this.idx.get(src); if (!ix) continue;
          for (const w of related) {
            const l = ix.post.get(w); if (!l) continue; highlight.add(w);
            let added = 0;
            for (const i of l) { const d = ix.docs[i]; if (seen.has(d.id)) continue; seen.add(d.id); hits.push({ id: d.id, src, ord: i, score: 100 - added, type: 'semantic', via: w }); if (++added >= 25) break; }
          }
        }
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return { query, hits, terms, root, related, highlight, ms: Math.round(performance.now() - t0) };
  }

  /** The original site's behaviour: direct (textual) matches first, in the source's own order; the lexical/semantic expansion is added
   *  only when direct matches are few; at most 80 results are returned and there is no relevance re-ordering. */
  /** al-Alfiya: a query made of ONE letter shows that letter's chapter («حرف الواو») with all its verses. Any longer query is searched normally. */
  letterSection(src: SourceId, raw: string): Lookup | null {
    const q = raw.normalize('NFC').replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\s]/g, '');
    if ([...q].length !== 1) return null;
    const NAMES: Record<string, string> = { ا: 'الألف', أ: 'الألف', إ: 'الألف', آ: 'الألف', ٱ: 'الألف', ب: 'الباء', ت: 'التاء', ج: 'الجيم', ح: 'الحاء', خ: 'الخاء', د: 'الدال', ذ: 'الذال', ر: 'الراء', ز: 'الزاي', س: 'السين', ش: 'الشين', ص: 'الصاد', ض: 'الضاد', ط: 'الطاء', ظ: 'الظاء', ع: 'العين', غ: 'الغين', ف: 'الفاء', ق: 'القاف', ك: 'الكاف', ل: 'اللام', م: 'الميم', ن: 'النون', ه: 'الهاء', و: 'الواو', ي: 'الياء', ى: 'الياء' };
    const name = NAMES[q]; if (!name) return null;
    const title = `حرف ${name}`;
    const docs = this.docsOf(src).filter((d) => d.chapter?.split(' — ').pop() === title);
    if (!docs.length) return null;
    return { query: raw, directCount: docs.length, semanticCount: 0, expansion: null, section: `باب ${title}`, highlight: new Set(),
      results: docs.map((doc, i) => ({ hit: { id: doc.id, src, ord: i, score: 0, type: 'literal' as MatchType }, doc, matchType: 'نصي' as const, matchedTerm: '' })), capped: false };
  }
  /** al-Alfiya: a query that names a chapter («الشجر» → «باب في الشجر والثمار», «اختلاج الأعضاء», «الباب الثالث عشر»…) shows that chapter's verses only,
   *  even when the chapter name is not typed exactly: every content word of the query must be a word of the chapter title (article, clitic, plural and
   *  pronoun-suffix tolerant). Queries that are not chapter names are searched normally. */
  chapterSection(src: SourceId, raw: string): Lookup | null {
    const STOP = new Set(['باب', 'الباب', 'حرف', 'في', 'ما', 'وما', 'من', 'به', 'بها', 'لحق', 'يتصل', 'ونحوه', 'ونحوها', 'واشباهها', 'واشباه', 'وغيره', 'فيمن', 'عن', 'الي', 'على']);
    const core = (w: string): string => {
      let t = normalize(w);
      for (const c of ['وال', 'فال', 'بال', 'كال', 'ولل', 'لل', 'ال']) if (t.startsWith(c) && t.length - c.length >= 2) { t = t.slice(c.length); break; }
      if (t.length > 3 && t.startsWith('و')) t = t.slice(1);
      for (const x of ['هم', 'ها', 'هن', 'كم', 'ات', 'ين', 'ون']) if (t.length - x.length >= 3 && t.endsWith(x)) { t = t.slice(0, -x.length); break; }
      if (t.length > 3 && /[ةهى]$/.test(t)) t = t.slice(0, -1);
      return t;
    };
    const words = (s: string) => tokens(normalize(s)).filter((w) => !STOP.has(w) && !STOP.has(core(w))).map(core).filter((w) => w.length >= 2);
    // broken plurals (أشجار ↔ شجر, طيور ↔ طير): compare also with the long vowels / leading alef dropped
    const forms = (w: string) => [w, w.replace(/ا/g, ''), w.replace(/و/g, ''), w.replace(/^[أإا]/, '').replace(/ا/g, '')].filter((x) => x.length >= 3);
    const same = (a: string, b: string) => a === b || forms(a).some((x) => forms(b).includes(x));
    const q = words(raw); if (!q.length || q.length > 5) return null;
    const docs = this.docsOf(src); const seen = new Map<string, { title: string; ord: number }>();
    docs.forEach((d, i) => { if (d.chapter && !seen.has(d.chapter)) seen.set(d.chapter, { title: d.chapter, ord: i }); });
    let best: string[] = []; let bestScore = 0;
    for (const { title } of seen.values()) {
      const parts = title.split(' — '); const topic = words(parts[parts.length - 1]); const ordinal = parts.length > 1 ? words(parts[0]) : [];
      let score = 0;
      const has = (b: string[], x: string) => b.some((y) => same(x, y));
      const eq = (a: string[], b: string[]) => a.length === b.length && a.every((x) => has(b, x));
      if (ordinal.length && eq(q, ordinal)) score = 3;                       // «الباب الثالث عشر»
      else if (topic.length && eq(q, topic)) score = 2.5;                    // the whole chapter name
      else if (q.every((w) => has(topic, w))) score = 1 + q.length / topic.length;   // some of its words: the better-covered chapter wins
      if (score > bestScore + 1e-9) { best = [title]; bestScore = score; } else if (score && Math.abs(score - bestScore) < 1e-9) best.push(title);
    }
    if (!best.length) return null;
    const set = new Set(best); const picked = docs.filter((d) => d.chapter && set.has(d.chapter));
    const label = (t: string) => { const ps = t.split(' — '); const l = ps[ps.length - 1]; return /^الفصل/.test(ps[0]) && ps.length > 1 ? t : /^(باب|خاتمة|تقديم)/.test(l) ? l : `باب ${l}`; };
    return { query: raw, directCount: picked.length, semanticCount: 0, expansion: null, section: best.map(label).join(' · '), highlight: new Set(),
      results: picked.map((doc, i) => ({ hit: { id: doc.id, src, ord: i, score: 0, type: 'literal' as MatchType }, doc, matchType: 'نصي' as const, matchedTerm: '' })), capped: false };
  }
  lookupOne(src: SourceId, raw: string): Lookup {
    if (this.kinds.get(src) === 'poem') { const s = this.letterSection(src, raw) ?? this.chapterSection(src, raw); if (s) return s; }
    const r = this.search(raw, { sources: new Set([src]), expand: 'always' });
    const strict = this.smart.get(src) === 'full';        // verses: the loose «skeleton» match of the original site finds unrelated words in short lines; only the word itself (with its clitics) counts as a direct hit
    let direct = r.hits.filter((h) => h.type === 'literal' || h.type === 'normalized' || (!strict && h.type === 'textual')).sort((a, b) => a.ord - b.ord);
    if (r.terms.length > 1) { const contiguous = direct.filter((h) => h.score >= 750); if (contiguous.length) direct = contiguous; }   // a phrase: prefer the words in sequence
    if (this.refFirst.has(src)) {                                    // «الجن» first shows the entries filed under the heading about the jinn
      const core = (w: string) => normalize(w).replace(/^(?:وال|فال|بال|لل|ال|و)/, '');
      const qs = r.terms.map(core).filter((w) => w.length >= 2);
      const inRef = (id: string) => { const rf = this.byId.get(id)?.ref; if (!rf || !qs.length) return false; const ws = tokens(normalize(rf)).map(core); return qs.every((q) => ws.some((w) => w === q || (q.length >= 3 && w.length >= 3 && (w.startsWith(q) || q.startsWith(w))))); };
      // then the entries where the word comes early (the symbol itself: «ومن رأى ملكاً…») before those that only mention it in passing
      const early = (id: string) => { const ws = tokens(normalize(this.byId.get(id)?.text ?? '')).map(core); return qs.length && qs.every((q) => { const k = ws.findIndex((w) => w === q || (q.length >= 3 && w.length >= 3 && (w.startsWith(q) || q.startsWith(w)))); return k >= 0 && k <= 7; }) ? 0 : 1; };
      const ranked = direct.map((h) => ({ h, f: inRef(h.id) ? 0 : 1, e: early(h.id) })); ranked.sort((a, b) => a.f - b.f || a.e - b.e || a.h.ord - b.h.ord); direct = ranked.map((x) => x.h);
    }
    let extra = r.hits.filter((h) => h.type === 'derived' || h.type === 'semantic').sort((a, b) => a.ord - b.ord);
    if (direct.length >= 5 || r.terms.length > 1) extra = [];      // expansion: only when direct matches are few, and only for a single word (it is root-based)
    const cap = this.caps.get(src) ?? (this.refFirst.has(src) ? 200 : MAX_RESULTS);      // the books / verses tabs hold many entries per word: show more
    const all = [...direct, ...extra]; const shown = all.slice(0, cap);
    const results = shown.map((hit) => {
      const doc = this.byId.get(hit.id)!; const isDirect = hit.type === 'literal' || hit.type === 'normalized' || hit.type === 'textual';
      return { hit, doc, matchType: (isDirect ? 'نصي' : 'دلالي') as 'نصي' | 'دلالي', matchedTerm: hit.via ?? '' };
    });
    const terms = r.related.length ? r.related : [...new Set(extra.map((h) => h.via).filter((x): x is string => !!x))].slice(0, 6);
    const hl = new Set(r.highlight); if (direct.length >= 5) { /* highlight only what was searched */ }
    return { query: r.query, directCount: direct.length, semanticCount: extra.length, expansion: extra.length || r.root ? { root: r.root, terms } : null, results, highlight: hl, capped: all.length > cap };
  }

  /** What the user typed, and — when it holds colloquial words — the same query read in standard Arabic; the results of all readings are joined
   *  (the words as typed first). In the books tab the entries are then split into those that tell what the symbol MEANS and those that only mention it. */
  lookup(src: SourceId, raw: string): Lookup {
    const sm = this.smart.get(src); const dv = sm ? dialectVariants(raw, sm === 'full') : { variants: [raw], notes: [], symbol: raw.trim() };       // colloquial words (and synonyms) are understood only in the tabs that ask for it
    let lk = this.lookupOne(src, dv.variants[0]);
    if (dv.variants.length > 1 && !lk.section) {
      const seen = new Set(lk.results.map((r) => r.doc.id)); const hl = new Set(lk.highlight); let direct = lk.directCount; let extra = lk.semanticCount; let capped = lk.capped;
      const cap = this.caps.get(src) ?? (this.refFirst.has(src) ? 200 : MAX_RESULTS); const results = [...lk.results];
      for (const v of dv.variants.slice(1)) {
        const o = this.lookupOne(src, v); o.highlight.forEach((w) => hl.add(w)); capped = capped || o.capped;
        for (const r of o.results) if (!seen.has(r.doc.id) && results.length < cap) { seen.add(r.doc.id); results.push(r); if (r.matchType === 'نصي') direct++; else extra++; }
      }
      lk = { ...lk, results, highlight: hl, directCount: direct, semanticCount: extra, capped, query: raw, dialect: dv.notes };
    } else if (dv.notes.length) lk = { ...lk, dialect: dv.notes };
    lk.query = raw; lk.symbol = dv.symbol;
    if (this.refFirst.has(src) && !lk.section) this.markMeanings(lk, dv.variants);
    return lk;
  }

  /** Books tab: an entry tells what a symbol means when the symbol is its subject (its heading, or the first words: «ومن رأى ملكاً…», «الملك يدل على…»); the others only
   *  mention the word. Entries that tell the meaning come first. Nothing is added to a text. */
  private markMeanings(lk: Lookup, variants: string[]) {
    const core = (w: string) => normalize(w).replace(/^(?:وال|فال|بال|كال|لل|ولل|ال|و|ف|ب|ل|ك)/, '');
    const sets = variants.map((v) => tokens(normalize(v)).map(core).filter((w) => w.length >= 2)).filter((a) => a.length);
    if (!sets.length) return;
    const same = (w: string, q: string) => w === q || (q.length >= 3 && w.length >= 3 && (w.startsWith(q) || q.startsWith(w)) && Math.abs(w.length - q.length) <= 2);
    const subject = (d: Doc): boolean => {
      const rf = d.ref ? tokens(normalize(d.ref)).map(core) : []; const tk = tokens(normalize(d.text)).map(core);
      return sets.some((qs) => qs.every((q) => rf.some((w) => same(w, q))) || qs.every((q) => tk.slice(0, 8).some((w) => same(w, q))) || qs.every((q) => /\bرؤي[ةه]\b|\bرؤيا\b/.test(normalize(d.text)) && tk.some((w, i) => same(w, q) && i > 0 && /^(?:رويا|رؤيه|رويه)$/.test(tk[i - 1]))));
    };
    const meaning: Lookup['results'] = []; const mention: Lookup['results'] = [];
    for (const r of lk.results) { const g = subject(r.doc) ? 'meaning' : 'mention'; r.group = g; (g === 'meaning' ? meaning : mention).push(r); }
    lk.results = [...meaning, ...mention]; lk.groups = { meaning: meaning.length, mention: mention.length };
  }
}
