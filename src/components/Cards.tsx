import { memo, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { normalize, normalizeB } from '../lib/arabic';
import { toAr, GRADE_KEY } from '../lib/format';
import type { Doc, Hit } from '../lib/types';

/** Highlights matching words in the ORIGINAL text (the text itself is never altered). */
export function Highlight({ text, words }: { text: string; words: Set<string> }) {
  const parts = useMemo(() => {
    const out: { t: string; m: boolean }[] = [];
    for (const tk of text.split(/(\s+)/)) {
      let m = false;
      if (tk.trim()) { const a = normalize(tk); m = !!a && (words.has(a) || words.has(normalizeB(tk))); }
      const last = out[out.length - 1];
      if (last && last.m === m) last.t += tk; else out.push({ t: tk, m });
    }
    return out;
  }, [text, words]);
  return <>{parts.map((p, i) => (p.m ? <mark className="search-hit" key={i}>{p.t}</mark> : <span key={i}>{p.t}</span>))}</>;
}

/** The pill of the original: «مطابقة نصية» or «دلالي: <matched word>» */
function MatchPill({ matchType, term }: { matchType: 'نصي' | 'دلالي'; term: string }) {
  const textual = matchType === 'نصي';
  return <span className={`pill ${textual ? 'pill-text' : 'pill-sem'}`}><i />{textual ? 'مطابقة نصية' : `دلالي: ${term}`}</span>;
}
/** original spelling of the document word that matched (the hit stores it normalised) */
const spelled = (text: string, norm: string) => (norm ? text.split(/\s+/).find((w) => normalize(w) === norm || normalizeB(w) === norm) ?? norm : '');

interface P { hit: Hit; doc: Doc; matchType: 'نصي' | 'دلالي'; matchedTerm: string; words: Set<string>; }

export const VerseCard = memo(function VerseCard({ doc, matchType, matchedTerm, words }: P) {
  return (
    <article className="verse-card" data-src="quran" data-match={matchType}>
      <div className="card-top">
        <div className="card-id">
          <span className="ayah-marker">{toAr(doc.ayah!)}</span>
          <div className="card-ref"><div className="t">سورة {doc.surahName}</div><div className="s">الآية {toAr(doc.ayah!)}</div></div>
        </div>
        <MatchPill matchType={matchType} term={spelled(doc.text, matchedTerm)} />
      </div>
      <p dir="rtl" className="verse-text quran-font"><Highlight text={doc.text} words={words} /></p>
    </article>
  );
});

export const HadithCard = memo(function HadithCard({ doc, matchType, matchedTerm, words }: P) {
  const grade = doc.grade ? GRADE_KEY[doc.grade] : '';
  return (
    <article className="verse-card" data-src="hadith" data-match={matchType}>
      <div className="card-top">
        <div className="card-ref">
          <div className="t">{doc.number ? `حديث رقم ${toAr(doc.number)}` : 'حديث'}</div>
          <div className="s">{`صفحة ${toAr(doc.page!)}`} • {doc.tier === 'v' ? 'مدقَّق على صورة الصفحة' : `قراءة آلية غير مراجَعة${doc.tier === 'l' ? ' (منخفضة الجودة)' : ''}`}</div>
        </div>
        <MatchPill matchType={matchType} term={spelled(doc.text, matchedTerm)} />
      </div>
      <p dir="rtl" className="hadith-text"><Highlight text={doc.text} words={words} /></p>
      {doc.takhrij && <p dir="rtl" className="takhrij">{doc.takhrij}</p>}
      <p dir="rtl" className="ruling" data-grade={doc.grade || doc.ungraded}><b>خلاصة حكم الحديث:</b> {grade || (doc.ungraded === 'unclear' ? 'غير واضح في الطبعة' : doc.tier === 'v' ? 'لا حكم مطبوع لهذا الحديث' : 'غير ظاهر في القراءة الآلية لهذا الحديث')}</p>
    </article>
  );
});

export const PoemCard = memo(function PoemCard({ doc, matchType, matchedTerm, words, plain }: P & { plain?: boolean }) {
  return (
    <article className="verse-card" data-src="poem" data-match={matchType}>
      <div className="card-top">
        <div className="card-ref">
          <div className="t">{`البيت ${toAr(doc.verse!)}`}</div>
          <div className="s">{doc.poem ? `${doc.poem} • ` : ''}{doc.chapter ? `${doc.chapter}${doc.page ? ' • ' : ''}` : ''}{doc.page ? `صفحة ${toAr(doc.page)}` : ''}</div>
        </div>
        {!plain && <MatchPill matchType={matchType} term={spelled(doc.text, matchedTerm)} />}
      </div>
      <div dir="rtl" className="poem-verse"><p className="poem-shatr"><Highlight text={doc.shatr1!} words={words} /></p><p className="poem-shatr"><Highlight text={doc.shatr2!} words={words} /></p></div>
    </article>
  );
});

export const GenericCard = memo(function GenericCard({ doc, matchType, matchedTerm, words }: P) {
  const [open, setOpen] = useState(false);
  return (
    <article className="verse-card" data-src="generic" data-match={matchType}>
      <div className="card-top">
        <div className="card-ref"><div className="t">{doc.ref}</div></div>
        <MatchPill matchType={matchType} term={spelled(doc.text, matchedTerm)} />
      </div>
      <div className="proverb-row">
        <p dir="rtl" className="hadith-text">«<Highlight text={doc.text} words={words} />»</p>
        {doc.explanation && <button type="button" className="sharh" aria-expanded={open} onClick={() => setOpen((o) => !o)}>شرح<ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : undefined }} /></button>}
      </div>
      {doc.explanation && open && <p dir="rtl" className="sharh-text"><Highlight text={doc.explanation} words={words} /></p>}
    </article>
  );
});

/** text with its Qur'anic phrases (﴿ ﴾) set in the Qur'an font; the rest in the app font */
export function Rich({ text, words }: { text: string; words: Set<string> }) {
  return <>{text.split(/(﴿[^﴾]*﴾)/).map((seg, i) => (seg.startsWith('﴿') ? <span key={i} className="quran-inline"><Highlight text={seg} words={words} /></span> : <Highlight key={i} text={seg} words={words} />))}</>;
}

/** The label before «=»: the word that was searched; when the entry words it differently («الملائكة» for «ملك») the entry's own word that matched. */
function labelFor(text: string, query: string, words: Set<string>): string {
  const q = query.trim(); const qn = normalize(q).split(' ').filter(Boolean);
  const toks = text.split(/\s+/).map((t) => t.replace(/^[^\u0621-\u064A]+|[^\u0621-\u064A\u064B-\u065F\u0670]+$/g, '')).filter(Boolean);
  const nt = toks.map((t) => normalize(t));
  if (q && qn.every((w) => nt.includes(w) || nt.some((t) => t.length > w.length && (t === 'ال' + w || /^[وفبلك]?ال?/.test(t) && t.replace(/^(?:وال|فال|بال|لل|ال|و|ف|ب|ل|ك)/, '') === w)))) return q;     // the searched word is in the entry as typed
  const hit = toks.find((t) => { const a = normalize(t); return words.has(a) || words.has(normalizeB(t)); });
  return (hit ?? q).replace(/^[وفبك](?=ال)/, '').replace(/^لل/, 'ال');                   // «بالماء» -> «الماء»، «للملك» -> «الملك»
}

/** «الكتب»: the symbol (heading), then «<the word searched> = …» (what is reported about it), and a «وجه الشبه» button that opens the reason when there is one */
export const MeaningCard = memo(function MeaningCard({ doc, matchType, matchedTerm, words, query }: P & { query: string }) {
  const [open, setOpen] = useState(false); const label = useMemo(() => labelFor(doc.text, query, words), [doc.text, query, words]);
  return (
    <article className="verse-card" data-src="book" data-match={matchType}>
      <div className="card-top">
        <div className="card-ref"><div className="t">{doc.ref}</div></div>
        <MatchPill matchType={matchType} term={spelled(doc.text, matchedTerm)} />
      </div>
      <p dir="rtl" className="meaning-text"><b className="warad">{label} =</b> <Rich text={doc.text} words={words} /></p>
      {doc.explanation && <button type="button" className="sharh" aria-expanded={open} onClick={() => setOpen((o) => !o)}>وجه الشبه<ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : undefined }} /></button>}
      {doc.explanation && open && <div dir="rtl" className="wajh"><p><Rich text={doc.explanation} words={words} /></p></div>}
      {doc.source && <p dir="rtl" className="takhrij">المصدر: {doc.source}</p>}
    </article>
  );
});

/** «أبيات الاستشهاد»: the verse in two hemistichs (the entry text is «first … second»), the heading it is filed under and the book(s) that quote it */
export const ShahidCard = memo(function ShahidCard({ doc, matchType, matchedTerm, words }: P) {
  const [a, b] = doc.text.split(' … '); const [occasion, poet, variant] = (doc.explanation ?? '').split('\n');
  return (
    <article className="verse-card" data-src="shahid" data-match={matchType}>
      <div className="card-top">
        <div className="card-ref">{doc.ref ? <div className="t">{doc.ref}</div> : null}</div>
        <MatchPill matchType={matchType} term={spelled(doc.text, matchedTerm)} />
      </div>
      <div dir="rtl" className="poem-verse"><p className="poem-shatr"><Highlight text={a} words={words} /></p><p className="poem-shatr"><Highlight text={b ?? ''} words={words} /></p></div>
      {(occasion || poet || variant || doc.source) && <div dir="rtl" className="takhrij shahid-info">
        {occasion && <p>يقال {occasion}.</p>}
        {poet && <p>القائل: {poet}</p>}
        {variant && <p>ويُروى: {variant}</p>}
        {doc.source && <p>المصدر: {doc.source}</p>}
      </div>}
    </article>
  );
});
