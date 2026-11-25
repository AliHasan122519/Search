import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ListTree, Search, Type, ChevronRight, ChevronLeft, X, Images } from 'lucide-react';
import { parseJson } from '../lib/data';
import { toAr } from '../lib/format';
import { topmost } from './DreamsPanel';
import { BookEmbed } from './BookEmbed';

/** `toc` entry: [level, title, paragraph, 1?] — a 4th item (1) means the title is not a paragraph of the text (the reader jumps to the page only).  `lf`: [first paragraph, scan page] of each page of a text made from a scan (the page image can be shown); `weak`: paragraphs that start a page that was read poorly. */
export interface BookData { v: number; key: string; ocr: boolean; scanText?: boolean; toc: [number, string, number, number?][]; p: string[]; pg: [number, string][]; lf?: [number, number][]; weak?: number[]; q?: [number, number]; }
const CHUNK = 3200;                                     // letters in one page of the reader
const SIZES = [0.9, 1, 1.15, 1.3, 1.5];
const MARK = /[\u064B-\u065F\u0670\u0640]/;
const FOLD: Record<string, string> = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ة': 'ه' };
/** the letters of a text without the marks of vocalisation and with the hamza / alif maqsura / ta marbuta folded; `map` gives the place of each kept letter in the original text */
function fold(t: string): { s: string; map: number[] } { let s = ''; const map: number[] = []; for (let i = 0; i < t.length; i++) { const c = t[i]; if (MARK.test(c)) continue; s += FOLD[c] ?? c; map.push(i); } return { s, map }; }
const mem = (k: string, v?: string): string | null => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); return v; } catch { return null; } };

/** The pages of the reader: the paragraphs in runs of about CHUNK letters; a chapter of the first level starts a new page when the page already has something. */
function pages(d: BookData): number[] {
  const top = new Set(d.toc.filter((t) => t[0] === 1).map((t) => t[2])); const starts = [0]; let acc = 0;
  for (let i = 0; i < d.p.length; i++) {
    if (i && ((top.has(i) && acc > 900) || acc >= CHUNK)) { starts.push(i); acc = 0; }
    acc += d.p[i].length;
  }
  return starts;
}

function Marked({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.indexOf(q); if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="hl">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

/** The reader of a book inside the app: its text in pages, the table of contents (فهرس), a search inside the book, the size of the letters, and the place where the reader stopped is kept.
 *  A book read from a scan (OCR) says so and can show the scanned pages beside its text. */
export function BookReader({ title, file, load, scan, startAt, onClose }: { title: string; file: string; load: (rel: string) => Promise<ArrayBuffer | null>; scan?: string; startAt?: number; onClose: () => void }) {
  const [data, setData] = useState<BookData | null>(null); const [err, setErr] = useState('');
  const [page, setPage] = useState(0); const [size, setSize] = useState(Number(mem('qs.read.size')) || 1);
  const [panel, setPanel] = useState<'toc' | 'search' | null>(null); const [tq, setTq] = useState(''); const [sq, setSq] = useState(''); const [hl, setHl] = useState('');
  const [target, setTarget] = useState<number | null>(null); const [scanOn, setScanOn] = useState<number | null | false>(false);
  const back = useRef<HTMLDivElement>(null); const scroller = useRef<HTMLDivElement>(null); const closeBtn = useRef<HTMLButtonElement>(null);
  const key = 'qs.read.' + file;

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const buf = await load(file); if (dead) return; if (!buf) { setErr('تعذّر فتح الكتاب. تأكد من الاتصال بالإنترنت ثم حاول مرة أخرى.'); return; }
        const d = parseJson<BookData>(buf); setData(d);
        const saved = Number(mem(key)); const at = startAt ?? (Number.isFinite(saved) ? saved : 0); setTarget(at);
      } catch { if (!dead) setErr('تعذّر قراءة ملف الكتاب.'); }
    })();
    return () => { dead = true; };
  }, [file, load, startAt, key]);

  const starts = useMemo(() => (data ? pages(data) : [0]), [data]);
  const pageOf = useCallback((idx: number) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= idx) lo = m; else hi = m - 1; } return lo; }, [starts]);
  useEffect(() => { if (target !== null && data) { const pg = pageOf(target); setPage(pg); } }, [target, data, pageOf]);
  useEffect(() => {                                        // after the page is drawn: to the heading / the paragraph asked for, else to the top
    if (!data) return;
    const el = target !== null ? document.getElementById('rd-p' + target) : null;
    if (el && target !== starts[page]) el.scrollIntoView({ block: 'start' }); else scroller.current?.scrollTo({ top: 0 });
  }, [page, data, target, starts]);
  useEffect(() => { if (data) mem(key, String(starts[page] ?? 0)); }, [page, data, starts, key]);
  useEffect(() => { closeBtn.current?.focus(); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key !== 'Escape' || !topmost(back.current)) return; if (panel) setPanel(null); else onClose(); };
    document.addEventListener('keydown', k); const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [panel, onClose]);

  const heads = useMemo(() => { const m = new Map<number, number>(); data?.toc.forEach(([l, , i, j]) => { if (!j) m.set(i, l); }); return m; }, [data]);
  const pgs = useMemo(() => new Map<number, string>(data?.pg ?? []), [data]);
  const norm = useMemo(() => (panel === 'search' && data ? data.p.map(fold) : null), [panel, data]);
  const hits = useMemo(() => {
    const q = fold(sq.trim()).s; if (!norm || q.length < 2) return [];
    const out: { i: number; at: number; end: number }[] = [];
    for (let i = 0; i < norm.length && out.length < 150; i++) { const at = norm[i].s.indexOf(q); if (at >= 0) out.push({ i, at: norm[i].map[at], end: norm[i].map[at + q.length - 1] + 1 }); }
    return out;
  }, [norm, sq]);
  const go = (idx: number, mark = '') => { setHl(mark); setTarget(idx); setPanel(null); if (idx === target) setPage(pageOf(idx)); };
  const cur = useMemo(() => { if (!data) return -1; let k = -1; const s = starts[page] ?? 0; const e = (starts[page + 1] ?? data.p.length) - 1; data.toc.forEach(([, , i], n) => { if (i <= e) k = n; if (i <= s) k = n; }); return k; }, [data, page, starts]);
  const tocShown = useMemo(() => { const q = fold(tq.trim()).s; return (data?.toc ?? []).map((t, n) => ({ t, n })).filter(({ t }) => !q || fold(t[1]).s.includes(q)); }, [data, tq]);
  const setSz = (d: number) => { const n = Math.min(SIZES.length - 1, Math.max(0, SIZES.indexOf(size) + d)); setSize(SIZES[n]); mem('qs.read.size', String(SIZES[n])); };
  const last = starts.length - 1;
  const flip = (to: number) => { setHl(''); setTarget(starts[Math.min(last, Math.max(0, to))]); };

  const i0 = starts[page] ?? 0, i1 = starts[page + 1] ?? data?.p.length ?? 0;
  const leafOf = (idx: number): number | null => { const lf = data?.lf; if (!lf?.length) return null; let r: number | null = null; for (const [i, l] of lf) { if (i <= idx) r = l; else break; } return r ?? lf[0][1]; };
  const weakAt = useMemo(() => new Set(data?.weak ?? []), [data]);
  if (scanOn !== false && scan) return <BookEmbed title={title} id={scan} toc={[]} tocSrc="" startLeaf={scanOn} onClose={() => setScanOn(false)} backLabel="الرجوع إلى النص" />;
  return (
    <div ref={back} className="panel-back nested rd-back" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="panel rd" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="rd-bar">
          <button type="button" ref={closeBtn} className="drawer-x" aria-label="رجوع" onClick={onClose}><ArrowRight size={20} aria-hidden="true" /></button>
          <h2 className="rd-title">{title}</h2>
          <div className="rd-tools">
            <button type="button" className="rd-tool" aria-label="فهرس الكتاب" aria-pressed={panel === 'toc'} onClick={() => setPanel(panel === 'toc' ? null : 'toc')}><ListTree size={19} aria-hidden="true" /><span>الفهرس</span></button>
            <button type="button" className="rd-tool" aria-label="بحث داخل الكتاب" aria-pressed={panel === 'search'} onClick={() => setPanel(panel === 'search' ? null : 'search')}><Search size={19} aria-hidden="true" /><span>بحث</span></button>
            <button type="button" className="rd-tool" aria-label="تصغير الخط" onClick={() => setSz(-1)}><Type size={14} aria-hidden="true" />−</button>
            <button type="button" className="rd-tool" aria-label="تكبير الخط" onClick={() => setSz(1)}><Type size={19} aria-hidden="true" />+</button>
          </div>
        </div>
        {err && <p className="rd-msg" role="alert">{err}</p>}
        {!data && !err && <p className="rd-msg" role="status">جارٍ فتح الكتاب…</p>}
        {data?.ocr && (
          <p className="rd-ocr" role="note">{data.q ? `جودة القراءة الآلية لهذا الكتاب: ${['', 'جيدة', 'متوسطة', 'ضعيفة'][data.q[0]]}. ` : ''}{data.scanText ? 'نص مقروء آلياً (OCR) وقد تبقى فيه أخطاء، والمرجع صورة الصفحة.' : 'نص مقروء آلياً (OCR) وقد تكثر فيه الأخطاء.'}{scan && <> <button type="button" className="rd-link" onClick={() => setScanOn(data.scanText ? leafOf(i0) : null)}><Images size={15} aria-hidden="true" /> {data.scanText ? 'اعرض صورة هذه الصفحة' : 'اعرض صور الصفحات الأصلية'}</button></>}</p>
        )}
        {data && (
          <>
            <div className="rd-scroll" ref={scroller} style={{ fontSize: `${size}rem` }} data-page={page} tabIndex={0} role="region" aria-label="صفحة من الكتاب (مرّر بالأسهم)">
              <article dir="rtl" className="rd-text" aria-label="نص الكتاب">
                {data.p.slice(i0, i1).map((t, k) => {
                  const idx = i0 + k; const lv = heads.get(idx); const pn = pgs.get(idx);
                  return (
                    <div key={idx} id={'rd-p' + idx} className={lv ? `rd-h rd-h${lv}` : 'rd-p'}>
                      {pn && <span className="rd-pg" aria-label={(data.scanText ? 'صفحة الملف المصوَّر ' : 'صفحة المطبوع ') + pn}>{pn}</span>}
                      {weakAt.has(idx) && <span className="rd-weak" role="note">قراءة هذه الصفحة ضعيفة؛ راجع صورتها.</span>}
                      {lv ? <h3><Marked text={t} q={hl} /></h3> : <p><Marked text={t} q={hl} /></p>}
                    </div>
                  );
                })}
              </article>
            </div>
            <div className="rd-nav">
              <button type="button" className="rd-step" disabled={page >= last} onClick={() => flip(page + 1)} aria-label="الصفحة التالية"><ChevronRight size={20} aria-hidden="true" /><span>التالي</span></button>
              <label className="rd-range"><span className="sr-only">الانتقال بين الصفحات</span>
                <input type="range" min={0} max={last} value={page} onChange={(e) => flip(Number(e.target.value))} aria-valuetext={`الصفحة ${toAr(page + 1)} من ${toAr(last + 1)}`} />
                <bdi dir="ltr" className="rd-count">{toAr(page + 1)} / {toAr(last + 1)}</bdi></label>
              <button type="button" className="rd-step" disabled={page <= 0} onClick={() => flip(page - 1)} aria-label="الصفحة السابقة"><span>السابق</span><ChevronLeft size={20} aria-hidden="true" /></button>
            </div>
          </>
        )}
        {panel && data && (
          <div className="rd-sheet" role="dialog" aria-label={panel === 'toc' ? 'فهرس الكتاب' : 'البحث داخل الكتاب'}>
            <div className="rd-sheet-head"><h3>{panel === 'toc' ? `فهرس الكتاب (${toAr(data.toc.length)})` : 'البحث داخل الكتاب'}</h3><button type="button" className="drawer-x" aria-label="إغلاق" onClick={() => setPanel(null)}><X size={18} aria-hidden="true" /></button></div>
            {panel === 'toc' ? (
              <>
                <input className="rd-input" type="search" placeholder="ابحث في الفهرس" aria-label="ابحث في الفهرس" value={tq} onChange={(e) => setTq(e.target.value)} />
                <ol className="rd-toc">
                  {tocShown.map(({ t, n }) => (<li key={n} className={`lv${t[0]}${n === cur ? ' on' : ''}`}><button type="button" onClick={() => go(t[2])} aria-current={n === cur ? 'location' : undefined}>{t[1]}</button></li>))}
                  {!tocShown.length && <li className="rd-none">لا يوجد في الفهرس ما يطابق ما كتبت.</li>}
                </ol>
              </>
            ) : (
              <>
                <input className="rd-input" type="search" placeholder="اكتب كلمة أو عبارة" aria-label="كلمة البحث داخل الكتاب" value={sq} onChange={(e) => setSq(e.target.value)} autoFocus />
                <p className="rd-hits-count" role="status">{sq.trim().length < 2 ? 'اكتب حرفين على الأقل.' : hits.length ? `${toAr(hits.length)}${hits.length >= 150 ? ' أو أكثر' : ''} موضعاً` : 'لا توجد نتائج.'}</p>
                <ol className="rd-hits">
                  {hits.map(({ i, at, end }) => { const t = data.p[i]; const a = Math.max(0, at - 40); return (<li key={i}><button type="button" onClick={() => go(i, t.slice(at, end))}><span className="rd-snip">{a > 0 ? '…' : ''}{t.slice(a, at)}<mark className="hl">{t.slice(at, end)}</mark>{t.slice(end, end + 50)}{end + 50 < t.length ? '…' : ''}</span></button></li>); })}
                </ol>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
