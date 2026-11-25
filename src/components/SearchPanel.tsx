import { useRef, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import type { Engine } from '../lib/engine';
import type { Kind, Lookup, SourceId, Tab } from '../lib/types';
import { ICONS } from './icons';
import { toAr } from '../lib/format';
import { VerseCard, HadithCard, GenericCard, PoemCard, MeaningCard, ShahidCard } from './Cards';

export type SourceState = 'loading' | 'ready' | 'absent' | 'error';

const CFG: Record<Kind, { placeholder: string; hint: string; empty: string }> = {
  quran: { placeholder: 'اكتب هنا', hint: 'البحث يبدأ مطابقاً لرسم المصحف، فإن قلّت النتائج فُعِّلت التوسعة الدلالية تلقائياً.', empty: 'لم نعثر على آيات تطابق بحثك حتى بعد التوسعة الدلالية.' },
  hadith: { placeholder: 'اكتب هنا', hint: 'اكتب لفظاً أو عبارة، ويُفعَّل التوسع الدلالي عند قلّة النتائج.', empty: 'لم نعثر على أحاديث تطابق بحثك.' },
  poem: { placeholder: 'اكتب هنا', hint: 'اكتب لفظاً أو عبارة، أو حرفاً واحداً لعرض باب ذلك الحرف.', empty: 'لم نعثر على أبيات تطابق بحثك.' },
  generic: { placeholder: 'اكتب هنا', hint: 'اكتب لفظاً أو عبارة للبحث.', empty: 'لم نعثر على نتائج تطابق بحثك.' },
};

export function SearchPanel({ tab, engine, state, retry }: { tab: Tab; engine: Engine; state: SourceState; retry: () => void }) {
  const src: SourceId = tab.id; const base = CFG[tab.kind] ?? CFG.generic; const cfg = { ...base, placeholder: 'اكتب هنا', hint: tab.hint ?? base.hint, Icon: ICONS[tab.kind] ?? ICONS.generic };
  const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const [res, setRes] = useState<Lookup | null>(null); const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const run = (text: string) => {
    const t = text.trim(); if (!t || busy) return;
    setBusy(true); setFailed(false); setQ(''); input.current?.blur();          // the searched term leaves the box by itself once the search is made
    setTimeout(() => {                                   // lets the loading state paint, like the original's request round-trip
      try { setRes(engine.lookup(src, t)); } catch { setFailed(true); }
      setBusy(false);
    }, 250);
  };
  const waiting = state === 'loading';
  return (
    <div className="space">
      <form className="sform" onSubmit={(e) => { e.preventDefault(); run(q); }}>
        <div className="field">
          <Search size={20} className="field-ic" aria-hidden="true" />
          <label className="sr" htmlFor={`q-${src}`}>{cfg.placeholder}</label>
          <input id={`q-${src}`} ref={input} value={q} dir="rtl" enterKeyHint="search" inputMode="search" autoComplete="off" placeholder={cfg.placeholder} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="form-row">
          <button type="submit" className="go" disabled={busy || !q.trim() || waiting || state !== 'ready'}>
            {busy ? <><Loader2 size={16} className="spin" />جارٍ البحث…</> : <><Search size={16} />ابحث</>}
          </button>
        </div>
      </form>

      {state === 'error' && <div className="err" role="alert">تعذّر إتمام البحث الآن. الرجاء المحاولة مرة أخرى بعد قليل. <button type="button" className="retry" onClick={retry}>إعادة المحاولة</button></div>}
      {failed && <div className="err" role="alert">تعذّر إتمام البحث الآن. الرجاء المحاولة مرة أخرى بعد قليل.</div>}
      {state === 'absent' && <div className="soft" role="status"><cfg.Icon size={26} /><p>هذا القسم غير متاح حالياً.</p></div>}
      {(waiting || busy) && !res && <Skeleton />}
      {!busy && state === 'ready' && res && <Results res={res} kind={tab.kind} card={tab.card} empty={cfg.empty} />}
    </div>
  );
}

function Skeleton() {
  return <div className="space" aria-hidden="true">{[0, 1, 2].map((i) => <div className="verse-card pulse" key={i} style={{ animationDelay: `${i * 120}ms` }}><div className="sk w32" /><div className="sk" /><div className="sk w11" /><div className="sk w3" /></div>)}</div>;
}

function Results({ res, kind, card, empty }: { res: Lookup; kind: Kind; card?: 'meaning' | 'verse' | 'dream' | 'person' | 'rule' | 'about' | 'library' | 'assistant'; empty: string }) {
  if (!res.results.length) {
    return <div className="soft" role="status">{empty}{res.expansion?.terms.length ? <div className="also">تم البحث أيضاً عن: {res.expansion.terms.slice(0, 8).join('، ')}</div> : null}</div>;
  }
  return (
    <div className="space" role="region" aria-label="النتائج" aria-live="polite">
      {res.section && <div className="stats"><div><b className="sect-title">{res.section}</b><span className="sep">•</span><span>عدد الأبيات: <b>{toAr(res.directCount)}</b></span></div></div>}
      {!res.section && <div className="stats">
        <div><span>نتائج مطابقة نصياً: <b>{toAr(res.directCount)}</b></span>{res.semanticCount > 0 && <><span className="sep">•</span><span>نتائج دلالية إضافية: <b>{toAr(res.semanticCount)}</b></span></>}{res.capped && <><span className="sep">•</span><span>عُرضت أول {toAr(res.results.length)} نتيجة</span></>}</div>
        {res.expansion && <div className="badges">{res.expansion.root && <span className="badge-root">الجذر: {res.expansion.root}</span>}{res.expansion.terms.slice(0, 6).map((t) => <span className="badge-2" key={t}>{t}</span>)}</div>}
      </div>}
      {res.dialect?.some((d) => d.kind === 'dialect') ? <div className="stats dialect-note" role="note">{res.dialect.map((d) => d.kind === 'dialect' ? <div key={d.from + 'd'}>فُهمت «{d.from}» بالفصحى: <b>{d.to.join('، ')}</b></div> : null)}</div> : null}
      {res.results.map((r, idx) => {
        const head = r.group && (idx === 0 || res.results[idx - 1].group !== r.group)
          ? <h3 className="group-title" key={'g' + idx}>{r.group === 'meaning' ? `معاني «${res.symbol ?? res.query}» (${toAr(res.groups?.meaning ?? 0)})` : `ورد ذكره أيضاً في كلام المعبّرين (${toAr(res.groups?.mention ?? 0)})`}</h3> : null;
        const el = kind === 'quran' ? <VerseCard key={r.doc.id} {...r} words={res.highlight} /> : kind === 'hadith' ? <HadithCard key={r.doc.id} {...r} words={res.highlight} /> : kind === 'poem' ? <PoemCard key={r.doc.id} {...r} words={res.highlight} plain={!!res.section} /> : card === 'meaning' ? <MeaningCard key={r.doc.id} {...r} words={res.highlight} query={res.symbol ?? res.query} /> : card === 'verse' ? <ShahidCard key={r.doc.id} {...r} words={res.highlight} /> : <GenericCard key={r.doc.id} {...r} words={res.highlight} />;
        return head ? [head, el] : el;
      })}
    </div>
  );
}
