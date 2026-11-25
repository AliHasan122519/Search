import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Doc } from '../lib/types';
import { normalize } from '../lib/arabic';
import { dialectVariants } from '../lib/dialect';
import { toAr } from '../lib/format';
import { Rich } from './Cards';
import { topmost } from './DreamsPanel';

const PAGE = 20;
const CLITIC = '(?:وال|فال|بال|كال|لل|ول|ال|و|ف|ب|ك|ل)?';
/** «<passage>\t<book>» lines of an entry */
const passages = (s?: string) => (s ?? '').split('\n').filter(Boolean).map((l) => { const [t, src] = l.split('\t'); return { t, src: src ?? '' }; });

/** One rule of interpretation, as the books themselves put it: the passages that state it (each with its book), then the passages that give examples. */
const RuleCard = memo(function RuleCard({ doc, words, l1, l2 }: { doc: Doc; words: Set<string>; l1?: string; l2?: string }) {
  const rule = passages(doc.text); const ex = passages(doc.explanation);
  return (
    <article className="verse-card rule-card" data-src="rule">
      <div className="card-top">
        <h3 className="rule-title">{doc.ref}</h3>
        {doc.by && <div className="dream-pills"><span className="pill pill-sem"><i />{doc.by}</span></div>}
      </div>
      {(l1 ?? (rule.length > 1 ? 'ما نصّت عليه الكتب' : 'ما نصّ عليه الكتاب')) && <h3 className="dream-label">{l1 ?? (rule.length > 1 ? 'ما نصّت عليه الكتب' : 'ما نصّ عليه الكتاب')}</h3>}
      {rule.map((p, i) => <p dir="rtl" className="bio-line" key={i}><Rich text={p.t} words={words} />{p.src ? <span className="bio-src"> — {p.src}</span> : null}</p>)}
      {ex.length > 0 && <>
        <h3 className="dream-label">{l2 ?? 'أمثلة'}</h3>
        {ex.map((p, i) => <p dir="rtl" className="bio-line" key={i}><Rich text={p.t} words={words} />{p.src ? <span className="bio-src"> — {p.src}</span> : null}</p>)}
      </>}
    </article>
  );
});

/** «قواعد علم التعبير»: the rules that the reference books state (derivation, misreading, likeness, the opposite, the proverb, the verse, what changes the interpretation, the interpreter's manners…),
 *  each passage word for word with the name of its book; searchable and filterable by group. */
export function RulesPanel({ title, docs, onClose, unit, sub, l1, l2 }: { title: string; docs: Doc[]; onClose: () => void; unit?: string; sub?: string; l1?: string; l2?: string }) {
  const [q, setQ] = useState(''); const [applied, setApplied] = useState(''); const [group, setGroup] = useState(''); const [limit, setLimit] = useState(PAGE);
  const back = useRef<HTMLDivElement>(null); const top = useRef<HTMLDivElement>(null); const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && topmost(back.current)) onClose(); };
    document.addEventListener('keydown', key); const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [onClose]);
  const index = useMemo(() => docs.map((d) => ({ d, hayT: ' ' + normalize(d.ref ?? ''), hay: ' ' + normalize(d.text.replace(/\t[^\n]*/g, '')), hayE: ' ' + normalize((d.explanation ?? '').replace(/\t[^\n]*/g, '')) })), [docs]);
  const groups = useMemo(() => { const m = new Map<string, number>(); for (const d of docs) if (d.by) m.set(d.by, (m.get(d.by) ?? 0) + 1); return [...m]; }, [docs]);
  const books = useMemo(() => new Set(docs.flatMap((d) => [...passages(d.text), ...passages(d.explanation)].map((p) => p.src).filter(Boolean))).size, [docs]);
  const { list, words } = useMemo(() => {
    const words = new Set<string>(); const rows = index.filter((x) => !group || x.d.by === group);
    const t = applied.trim();
    if (!t) return { list: rows.map((x) => x.d), words };
    const variants = dialectVariants(t).variants.map((v) => normalize(v).split(' ').filter((w) => w.length >= 2)).filter((v) => v.length);
    const rxs = variants.map((toks) => toks.map((w) => new RegExp('(?: )' + CLITIC + w)));
    for (const toks of variants) for (const w of toks) for (const c of ['', 'ال', 'و', 'ف', 'ب', 'ك', 'ل', 'وال', 'بال', 'لل']) words.add(c + w);
    const scored: { d: Doc; s: number }[] = [];
    for (const x of rows) {
      let best = -1;
      for (const toks of rxs) {
        if (toks.every((r) => r.test(x.hayT))) best = Math.max(best, 3);                                   // the rule's own name
        else if (toks.every((r) => r.test(x.hayT) || r.test(x.hay))) best = Math.max(best, 2);             // the passages that state it
        else if (toks.every((r) => r.test(x.hayT) || r.test(x.hay) || r.test(x.hayE))) best = Math.max(best, 1);   // or its examples
      }
      if (best > 0) scored.push({ d: x.d, s: best });
    }
    scored.sort((a, b) => b.s - a.s);
    return { list: scored.map((x) => x.d), words };
  }, [index, applied, group]);
  const submit = (e: React.FormEvent) => { e.preventDefault(); const t = q.trim(); if (!t) return; setApplied(t); setQ(''); setLimit(PAGE); top.current?.scrollIntoView({ block: 'start' }); };
  const shown = list.slice(0, limit);
  return (
    <div ref={back} className="panel-back" onClick={onClose}>
      <div className="panel" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="panel-head" ref={top}>
          <div><h2>{title}</h2></div>
          <button type="button" ref={close} className="drawer-x" aria-label="إغلاق" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </div>
        <form className="sform" onSubmit={submit}>
          <div className="field">
            <Search size={20} className="field-ic" aria-hidden="true" />
            <label className="sr" htmlFor="q-rules">اكتب هنا</label>
            <input id="q-rules" value={q} dir="rtl" enterKeyHint="search" inputMode="search" autoComplete="off" placeholder="اكتب هنا" onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="form-row">
            <label className="book-pick"><span className="sr">القسم</span>
              <select value={group} onChange={(e) => { setGroup(e.target.value); setLimit(PAGE); }} aria-label="القسم">
                <option value="">كل الأقسام</option>
                {groups.map(([g, n]) => <option key={g} value={g}>{g} ({toAr(n)})</option>)}
              </select>
            </label>
            <button type="submit" className="go" disabled={!q.trim()}><Search size={16} />ابحث</button>
          </div>
        </form>
        {applied && <div className="stats"><div><span>نتائج البحث عن «<b>{applied}</b>»: <b>{toAr(list.length)}</b></span></div><button type="button" className="retry" onClick={() => { setApplied(''); setLimit(PAGE); }}>عرض الكل</button></div>}
        <div className="space rule-list" role="region" aria-label="القائمة" aria-live="polite">
          {shown.map((d) => <RuleCard key={d.id} doc={d} words={words} l1={l1} l2={l2} />)}
          {!list.length && <div className="soft" role="status">لم نعثر على ما يطابق بحثك.</div>}
          {list.length > limit && <button type="button" className="go more" onClick={() => setLimit((n) => n + PAGE)}>عرض المزيد ({toAr(list.length - limit)} متبقية)</button>}
        </div>
      </div>
    </div>
  );
}
