import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ListTree, X } from 'lucide-react';
import { toAr } from '../lib/format';
import { topmost } from './DreamsPanel';

/** [level, title, page index (0 = the first picture)] */
export type OwnToc = [number, string, number][];

/** One picture of the book, opened only when it comes near the screen (the files are kept by the app once read, so the page shows again without the internet). */
function Page({ rel, n, load, refs }: { rel: string; n: number; load: (rel: string) => Promise<ArrayBuffer | null>; refs: React.MutableRefObject<(HTMLDivElement | null)[]> }) {
  const box = useRef<HTMLDivElement>(null); const [src, setSrc] = useState<string>(); const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = box.current; if (!el) return; refs.current[n] = el; let made = '', dead = false;
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return; io.disconnect();
      load(rel).then((b) => { if (dead) return; if (!b) { setFailed(true); return; } made = URL.createObjectURL(new Blob([b], { type: 'image/jpeg' })); setSrc(made); }).catch(() => setFailed(true));
    }, { rootMargin: '900px 0px' });
    io.observe(el);
    return () => { dead = true; io.disconnect(); if (made) URL.revokeObjectURL(made); };
  }, [rel, n, load, refs]);
  return <div ref={box} className="own-page" data-page={n + 1}>{src ? <img src={src} alt={`صفحة ${toAr(n + 1)}`} draggable={false} /> : <span className="own-wait">{failed ? 'تعذّر فتح هذه الصفحة. تأكد من الاتصال ثم أعد المحاولة.' : 'جارٍ فتح الصفحة…'}</span>}</div>;
}

/** A scan the app holds itself (the pages are files of the content, not a site): the pictures one under the other, with the table of contents jumping to a page. It opens without a viewer from another site. */
export function ScanPages({ title, dir, n, toc, tocSrc, load, onClose, backLabel = 'رجوع' }: { title: string; dir: string; n: number; toc: OwnToc; tocSrc: string; load: (rel: string) => Promise<ArrayBuffer | null>; onClose: () => void; backLabel?: string }) {
  const back = useRef<HTMLDivElement>(null); const refs = useRef<(HTMLDivElement | null)[]>([]); const [open, setOpen] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key !== 'Escape' || !topmost(back.current)) return; if (open) setOpen(false); else onClose(); };
    document.addEventListener('keydown', k); const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [open, onClose]);
  const go = (i: number) => { setOpen(false); setTimeout(() => refs.current[i]?.scrollIntoView({ block: 'start' }), 60); };
  return (
    <div ref={back} className="panel-back nested rd-back" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="panel rd" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="rd-bar">
          <button type="button" className="drawer-x" aria-label={backLabel} onClick={onClose}><ArrowRight size={20} aria-hidden="true" /></button>
          <h2 className="rd-title">{title}</h2>
          {toc.length > 0 && <div className="rd-tools"><button type="button" className="rd-tool" aria-label="فهرس الكتاب" aria-pressed={open} onClick={() => setOpen(!open)}><ListTree size={19} aria-hidden="true" /><span>الفهرس</span></button></div>}
        </div>
        <div className="own-pages" tabIndex={0} aria-label="صفحات الكتاب">{Array.from({ length: n }, (_, i) => <Page key={i} n={i} rel={`${dir}/${String(i).padStart(3, '0')}.jpg`} load={load} refs={refs} />)}</div>
        {open && (
          <div className="rd-sheet" role="dialog" aria-label="فهرس الكتاب">
            <div className="rd-sheet-head"><h3>فهرس الكتاب ({toAr(toc.length)})</h3><button type="button" className="drawer-x" aria-label="إغلاق" onClick={() => setOpen(false)}><X size={18} aria-hidden="true" /></button></div>
            <p className="rd-hits-count">{tocSrc}</p>
            <ol className="rd-toc">{toc.map(([lv, t, pg], k) => (<li key={k} className={`lv${lv || 1}`}><button type="button" onClick={() => go(pg)}>{t}<span className="rd-tocpg"> — ص {toAr(pg)}</span></button></li>))}</ol>
          </div>
        )}
      </div>
    </div>
  );
}
