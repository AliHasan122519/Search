import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ListTree, X } from 'lucide-react';
import { toAr } from '../lib/format';
import { topmost } from './DreamsPanel';

/** [level, title, leaf of the scan (null = unknown), page printed in the book (null = none)] */
export type ScanToc = [number, string, number | null, (number | null)?][];

/** A book that has no digital text, read inside the app from the images of its pages (the viewer of archive.org shown in a frame; it needs the internet), with the table of contents of the book itself. */
export function BookEmbed({ title, id, toc, tocSrc, startLeaf, manuscript, onClose, backLabel = 'رجوع' }: { title: string; id: string; toc: ScanToc; tocSrc: string; startLeaf?: number | null; manuscript?: boolean; onClose: () => void; backLabel?: string }) {
  const [leaf, setLeaf] = useState<number | null>(startLeaf ?? null); const [open, setOpen] = useState(false); const [rev, setRev] = useState(0);
  const back = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key !== 'Escape' || !topmost(back.current)) return; if (open) setOpen(false); else onClose(); };
    document.addEventListener('keydown', k); const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [open, onClose]);
  const src = `https://archive.org/embed/${id}${leaf !== null ? `#page/n${leaf}/mode/1up` : ''}`;
  return (
    <div ref={back} className="panel-back nested rd-back" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="panel rd" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="rd-bar">
          <button type="button" className="drawer-x" aria-label={backLabel} onClick={onClose}><ArrowRight size={20} aria-hidden="true" /></button>
          <h2 className="rd-title">{title}</h2>
          {toc.length > 0 && <div className="rd-tools"><button type="button" className="rd-tool" aria-label="فهرس الكتاب" aria-pressed={open} onClick={() => setOpen(!open)}><ListTree size={19} aria-hidden="true" /><span>الفهرس</span></button></div>}
        </div>
        <iframe key={rev} className="rd-frame" title={`صفحات كتاب ${title}`} src={src} allowFullScreen loading="eager" referrerPolicy="no-referrer" />
        {open && (
          <div className="rd-sheet" role="dialog" aria-label="فهرس الكتاب">
            <div className="rd-sheet-head"><h3>فهرس الكتاب ({toAr(toc.length)})</h3><button type="button" className="drawer-x" aria-label="إغلاق" onClick={() => setOpen(false)}><X size={18} aria-hidden="true" /></button></div>
            <p className="rd-hits-count">{tocSrc}</p>
            <ol className="rd-toc">
              {toc.map(([lv, t, lf, pr], n) => (
                <li key={n} className={`lv${lv}`}><button type="button" disabled={lf === null && false} onClick={() => { setLeaf(lf); setRev((r) => r + 1); setOpen(false); }}>{t}{pr ? <span className="rd-tocpg"> — ص {toAr(pr)}</span> : null}</button></li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
