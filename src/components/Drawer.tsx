import { useEffect, useRef } from 'react';
import type { TouchEvent as RTouchEvent } from 'react';
import { Menu, X, MoonStar, CloudMoon, Sparkles, BookUser, Scale, GitCompareArrows, ScrollText, Info, ChevronLeft, LibraryBig, Eye, Feather } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** a small icon that says what each button of the side menu is (a dream, the prophets and the righteous, the interpreters); a new list falls back to the moon */
const ICONS: Record<string, LucideIcon> = { ruaa: CloudMoon, anbiya: Sparkles, muabbirun: BookUser, qawaid: Scale, muqaranat: GitCompareArrows, ruyahadith: ScrollText, kutubtabir: LibraryBig, nazm: Feather, kutubfiras: Eye, about: Info };

export interface DrawerItem { id: string; label: string; }

/** Button fixed at the top (the side opposite the theme button): opens the side menu. */
export function MenuButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" className="menu-toggle" aria-label="المزيد" title="المزيد" aria-haspopup="dialog" aria-expanded={open} onClick={onClick}>
      <Menu size={22} aria-hidden="true" />
    </button>
  );
}

/** The side menu: slides in from the side, lists what the content update adds there (today: «رؤى عبّرت»). Closes with Escape, with the ×, by touching outside, or by swiping it back toward its edge. */
export function Drawer({ open, items, onPick, onClose }: { open: boolean; items: DrawerItem[]; onPick: (id: string) => void; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const side = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; dir: 1 | -1; dx: number; live: boolean } | null>(null);
  useEffect(() => {
    if (!open) return;
    // the keyboard goes away by itself when the menu opens (it never stays up behind the menu)
    const active = document.activeElement as HTMLElement | null; if (active && active !== document.body) active.blur();
    close.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open, onClose]);
  // swipe toward the edge the menu came from (the right edge in Arabic) to close it, like dragging it away; a short drag springs back
  const start = (e: RTouchEvent) => {
    const t = e.touches[0]; const r = side.current?.getBoundingClientRect(); if (!t || !r) return;
    drag.current = { x: t.clientX, y: t.clientY, dir: r.left + r.width / 2 > window.innerWidth / 2 ? 1 : -1, dx: 0, live: false };
  };
  const move = (e: RTouchEvent) => {
    const d = drag.current; const t = e.touches[0]; if (!d || !t) return;
    const dx = (t.clientX - d.x) * d.dir; const dy = Math.abs(t.clientY - d.y);
    if (!d.live) { if (dx > 10 && dx > dy * 1.2) d.live = true; else if (dy > 10) { drag.current = null; return; } else return; }
    d.dx = Math.max(0, dx);
    const el = side.current; if (el) { el.style.animation = 'none'; el.style.transition = 'none'; el.style.transform = `translateX(${d.dx * d.dir}px)`; }
  };
  const end = () => {
    const d = drag.current; drag.current = null; const el = side.current; if (!d || !d.live || !el) return;
    const w = el.getBoundingClientRect().width;
    if (d.dx > Math.min(80, w * 0.3)) { el.style.transition = 'transform .16s ease-out'; el.style.transform = `translateX(${w * d.dir}px)`; window.setTimeout(onClose, 150); }
    else { el.style.transition = 'transform .16s ease-out'; el.style.transform = ''; }
  };
  if (!open) return null;
  return (
    <div className="drawer-back" onClick={onClose} onTouchStart={start} onTouchMove={move} onTouchEnd={end} onTouchCancel={end}>
      <aside ref={side} className="drawer" role="dialog" aria-modal="true" aria-label="المزيد" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2>المزيد</h2>
          <button type="button" ref={close} className="drawer-x" aria-label="إغلاق" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </div>
        <nav className="drawer-list" aria-label="أقسام المزيد">
          {items.map((it) => (
            <button type="button" key={it.id} className="drawer-item" onClick={() => onPick(it.id)}>
              <span className="drawer-ic" aria-hidden="true">{(() => { const Ic = ICONS[it.id] ?? MoonStar; return <Ic size={20} strokeWidth={1.9} />; })()}</span>
              <span className="drawer-label">{it.label}</span>
              <ChevronLeft className="drawer-go" size={20} aria-hidden="true" />
            </button>
          ))}
          {!items.length && <p className="drawer-empty">لا توجد أقسام الآن.</p>}
        </nav>
      </aside>
    </div>
  );
}
