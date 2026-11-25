/**
 * Arabic text processing: the declared normalisation policy and a light, rule-based stemmer.
 * Original texts are NEVER modified: all functions here produce separate search copies.
 *
 * Normalisation policy (applies to both texts and queries):
 *  1. remove tashkeel, Qur'anic marks (U+0610-061A, 064B-065F, 0670, 06D6-06ED, 08D3-08FF), tatweel, bidi marks
 *  2. أ إ آ ٱ -> ا     3. ى -> ي     4. ؤ -> و     5. ئ -> ي     6. ة -> ه
 *  7. anything that is not an Arabic letter becomes a space; runs of spaces collapse
 *  Qur'anic orthography: the dagger alif (U+0670) is removed in variant A and turned into ا in variant B so that
 *  both «الرحمن» and «العالمين» match the Uthmani spellings «ٱلرَّحۡمَٰنِ» / «ٱلۡعَٰلَمِينَ».
 */
export const MARKS_RE = /[ؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿـ​-‏‪-‮]/g;
const MARKS_NO_DAGGER_RE = /[ؐ-ًؚ-ٟۖ-ۭ࣓-ࣿـ​-‏‪-‮]/g;
const baseMap = (s: string) =>
  s.replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[^ء-ي\s]/g, ' ').replace(/\s+/g, ' ').trim();

// Uthmani spellings that differ from modern orthography after normalisation (tail replacement per token)
const ORTH: [string, string][] = [['صلوه', 'صلاه'], ['زكوه', 'زكاه'], ['حيوه', 'حياه'], ['مشكوه', 'مشكاه'], ['نجوه', 'نجاه']];
const fixOrth = (s: string) =>
  s.split(' ').map((t) => { for (const [a, b] of ORTH) if (t.endsWith(a)) return t.slice(0, -a.length) + b; return t; }).join(' ');

/** Standard search form (variant A). */
export const normalize = (s: string): string => fixOrth(baseMap(s.replace(MARKS_RE, '')));
/** Variant B: dagger alif rendered as ا (only meaningful for Qur'anic text). */
export const normalizeB = (s: string): string => fixOrth(baseMap(s.replace(MARKS_NO_DAGGER_RE, '').replace(/ٰ/g, 'ا')));
export const tokens = (s: string): string[] => (s ? s.split(' ').filter(Boolean) : []);
export const hasMarks = (s: string) => /[ً-ٰٟۖ-ۭ]/.test(s);
export const stripTatweel = (s: string) => s.replace(/ـ/g, '');

// ----- light stemmer ---------------------------------------------------------------------------------
const PREFIXES = ['', 'و', 'ف', 'ال', 'وال', 'فال', 'بال', 'كال', 'لل', 'ولل', 'فلل', 'ب', 'ك', 'ل', 'س', 'وس', 'فس', 'ا', 'وا', 'فا', 'است', 'واست', 'فاست', 'م', 'مت', 'مست', 'ي', 'ت', 'ن', 'بت', 'لت', 'لي', 'لن', 'وي', 'وت', 'ون', 'في', 'فت', 'سي', 'ست', 'سن', 'بالم', 'كالم', 'فالم', 'والم', 'لم', 'الم'];
const SUFFIXES = ['', 'ها', 'هما', 'هم', 'هن', 'كما', 'كم', 'كن', 'نا', 'ني', 'ك', 'ه', 'ون', 'ين', 'ان', 'ات', 'ا', 'ي', 'ت', 'تم', 'تن', 'تما', 'وا', 'تا', 'تموها', 'تموهم', 'يه', 'يها', 'يهم', 'تها', 'تهم', 'تنا', 'ناه', 'ناها', 'وه', 'وها', 'وهم', 'ية', 'يات', 'ونا', 'ينا', 'اه', 'اها', 'اهم'];
/** clitic particles that attach to a word without changing it: conjunctions, prepositions, the article */
export const CLITICS = ['و', 'ف', 'ب', 'ك', 'ل', 'ال', 'وال', 'فال', 'بال', 'كال', 'لل', 'ولل', 'فلل', 'ول', 'فل', 'وب', 'فب', 'وك', 'س', 'وس', 'فس'];
const ARTICLES = ['وال', 'فال', 'بال', 'كال', 'ولل', 'فلل', 'لل', 'ال'];
const WEAK = /[اويءه]/g;
export const skeleton = (w: string) => w.replace(WEAK, '');
/** Canonical stem of a QUERY word: only the definite article (with a leading و/ف/ب/ك/ل) is removed. */
export function queryStem(w: string): string {
  for (const a of ARTICLES) if (w.startsWith(a) && w.length - a.length >= 2) return w.slice(a.length);
  return w;
}
/** Keys under which a vocabulary word is filed: every plausible prefix/suffix stripping ('x:' exact stem, '~' skeleton). */
export function stemKeys(w: string): string[] {
  const out = new Set<string>();
  for (const p of PREFIXES) {
    if (p && !w.startsWith(p)) continue;
    const rest = w.slice(p.length);
    for (const s of SUFFIXES) {
      if (s && !rest.endsWith(s)) continue;
      const stem = s ? rest.slice(0, rest.length - s.length) : rest;
      if (stem.length < 3) continue;
      out.add('x:' + stem);
      const sk = skeleton(stem);
      if (sk.length >= 3) out.add('~' + sk);
    }
  }
  return [...out];
}
/** Lookup keys for a QUERY word (asymmetric on purpose: the query side is canonical, the document side ambiguous). */
export function queryKeys(w: string): string[] {
  const r = queryStem(w); const keys = ['x:' + r]; const sk = skeleton(r);
  if (sk.length >= 3) keys.push('~' + sk);
  return keys;
}
/** Approximate root shown to the user: weak-letter skeleton of the query stem, only when it has 3 letters. */
export function approxRoot(w: string): string {
  let r = queryStem(w);
  for (const s of ['ون', 'ين', 'ات', 'ان', 'وا', 'ها', 'هم', 'ه', 'ا', 'ي']) if (r.endsWith(s) && r.length - s.length >= 3) { r = r.slice(0, -s.length); break; }
  const sk = skeleton(r);
  return sk.length === 3 ? sk : '';
}

// ----- the original site's textual-match rule (as found in its public client code): prefix/suffix stripping + weak-letter skeleton -----
const REF_PREFIX = ['', 'و', 'ف', 'ال', 'وال', 'فال', 'بال', 'كال', 'لل', 'ولل', 'فلل', 'ب', 'ك', 'ل', 'س', 'وس', 'فس', 'ا', 'وا', 'فا', 'است', 'واست', 'فاست', 'م', 'مت', 'مست', 'ي', 'ت', 'ن', 'بت', 'لت', 'لي', 'لن', 'وي', 'وت', 'ون', 'في', 'فت', 'فب', 'فل', 'سي', 'ست', 'سن', 'بالم', 'كالم', 'فالم', 'والم', 'لم', 'الم'];
const REF_SUFFIX = ['', 'ها', 'هما', 'هم', 'هن', 'كما', 'كم', 'كن', 'نا', 'ني', 'ك', 'ه', 'ون', 'ين', 'ان', 'ات', 'ة', 'ا', 'ي', 'ت', 'تم', 'تن', 'تما', 'وا', 'تا', 'تموها', 'تموهم', 'يه', 'يها', 'يهم', 'تها', 'تهم', 'تنا', 'ناه', 'ناها', 'وه', 'وها', 'وهم', 'ية', 'يات', 'ونا', 'ينا', 'اه', 'اها', 'اهم'];
const refSr = (e: string, t: string): boolean => {
  if (e === t) return true;
  if (e.length <= t.length || !e.includes(t)) return false;
  for (const p of REF_PREFIX) {
    if (p && !e.startsWith(p)) continue;
    const r = e.slice(p.length);
    for (const s of REF_SUFFIX) if (r.endsWith(s) && (s ? r.slice(0, r.length - s.length) : r) === t) return true;
  }
  return false;
};
/** true when document word `e` is a textual match of query word `t` (both normalised) */
export function refTextMatch(e: string, t: string): boolean {
  if (refSr(e, t)) return true;
  const n = skeleton(t); if (n.length < 3) return false;
  const r = skeleton(e); return r === n || refSr(r, n);
}
