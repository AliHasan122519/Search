import { useEffect, useRef } from 'react';
import { X, Sparkles } from 'lucide-react';
import type { Doc } from '../lib/types';
import { topmost } from './DreamsPanel';

/** «حول التطبيق»: one description of what the platform does (the single row of content/about.json). No numbers, no counters. */
export function AboutPanel({ title, docs, onClose }: { title: string; docs: Doc[]; onClose: () => void }) {
  const back = useRef<HTMLDivElement>(null); const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && topmost(back.current)) onClose(); };
    document.addEventListener('keydown', key); const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div ref={back} className="panel-back" onClick={onClose}>
      <div className="panel about" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <div><h2>{title}</h2><p className="panel-sub">الباحث القرآني</p></div>
          <button type="button" ref={close} className="drawer-x" aria-label="إغلاق" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </div>
        <div className="about-hero"><Sparkles size={26} aria-hidden="true" /><p>{docs[0]?.text}</p></div>
      </div>
    </div>
  );
}
