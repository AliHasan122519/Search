import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Doc } from '../lib/types';
import { toAr } from '../lib/format';
import { Rich } from './Cards';
import { DreamsPanel, topmost } from './DreamsPanel';

/** «المعبِّرون»: who the interpreters are, as a brief card «الولادة: … / مكان الولادة: … / على يد من تعلم: …» (each value word for word from the biographical dictionary named in the last line)
 *  and, when the books report dreams he interpreted, the number of them and a button that opens exactly those dreams. */
export function PeoplePanel({ title, people, dreams, onClose }: { title: string; people: Doc[]; dreams: Doc[]; onClose: () => void }) {
  const [open, setOpen] = useState<{ title: string; docs: Doc[] } | null>(null);
  const back = useRef<HTMLDivElement>(null); const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && topmost(back.current)) onClose(); };
    document.addEventListener('keydown', key); const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [onClose]);
  const byKey = useMemo(() => { const m = new Map<string, Doc[]>(); for (const d of dreams) if (d.by) m.set(d.by, [...(m.get(d.by) ?? []), d]); return m; }, [dreams]);
  const none = new Set<string>();
  return (
    <div ref={back} className="panel-back" onClick={onClose}>
      <div className="panel" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <div><h2>{title}</h2></div>
          <button type="button" ref={close} className="drawer-x" aria-label="إغلاق" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </div>
        <div className="space">
          {people.map((p) => {
            const mine = byKey.get(p.by ?? '') ?? [];
            return (
              <article className="verse-card person-card" key={p.id} data-src="person">
                <h3 className="person-name">{p.ref}</h3>
                {p.text.split('\n').map((line, i) => { const [k, v] = line.split('\t'); return (
                  <p dir="rtl" className="bio-line" key={i}><span className="bio-k">{k}</span> <Rich text={v ?? ''} words={none} /></p>
                ); })}
                {mine.length > 0
                  ? <button type="button" className="go person-btn" onClick={() => setOpen({ title: `رؤى عبّرها ${(p.ref ?? '').replace(/\s*\(.*$/, '')}`, docs: mine })}>رؤاه المعبَّرة في الكتب ({toAr(mine.length)})</button>
                  : <p className="takhrij">لا تحمل الكتب المرفوعة رؤيا ذُكر فيها أنه عبّرها.</p>}
              </article>
            );
          })}
        </div>
      </div>
      {open && <DreamsPanel nested title={open.title} docs={open.docs} onClose={() => setOpen(null)} />}
    </div>
  );
}
