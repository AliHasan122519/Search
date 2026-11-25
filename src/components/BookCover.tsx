import { useId } from 'react';

/** The cover of a book: the printed edition's own cover (a picture, `photo`) when the content has one, else the drawn one below.
 *  The covers of the book lists are drawn here (no image file, so they work offline, in both themes and in every size): a palette, a pattern of the background and the emblem of the science
 *  («علم التعبير» a crescent and a star, «علم الفراسة» an eye); the title is wrapped in the lines the cover can hold. Both choices come from the content (`cover: {p, m}`). */
const PALETTES = [
  { a: '#0F4D41', b: '#0A3229', g: '#D8B866', t: '#FFF6DC' },   // 0 emerald
  { a: '#1B2A6B', b: '#101A45', g: '#E3C26E', t: '#FFF8E6' },   // 1 indigo
  { a: '#6B1E2E', b: '#430F1C', g: '#F0DDB0', t: '#FFF6E8' },   // 2 burgundy
  { a: '#0E6B73', b: '#093F45', g: '#F2B44A', t: '#F2FFFC' },   // 3 teal
  { a: '#2A2824', b: '#0F0E0C', g: '#D4A94A', t: '#F8F0DA' },   // 4 ink
  { a: '#4B2A6B', b: '#2B1644', g: '#F1C96B', t: '#FBF4FF' },   // 5 plum
  { a: '#55611F', b: '#333B0E', g: '#E8D9A0', t: '#FAF8E8' },   // 6 olive
  { a: '#9C4A2F', b: '#62291A', g: '#F5E1B5', t: '#FFF8EE' },   // 7 terracotta
  { a: '#2D4A66', b: '#192C40', g: '#E6C887', t: '#F4F8FC' },   // 8 slate
  { a: '#5B3A1E', b: '#34200E', g: '#E0C080', t: '#FFF6E6' },   // 9 walnut
];
const MOTIFS: ((g: string) => JSX.Element)[] = [
  (g) => <path d="M20 4l4 10 10-4-4 10 10 4-10 4 4 10-10-4-4 10-4-10-10 4 4-10-10-4 10-4-4-10 10 4z" fill="none" stroke={g} strokeWidth="1" />,          // 0 eight-pointed stars
  (g) => <path d="M0 40V22a20 20 0 0 1 40 0v18M10 40V24a10 10 0 0 1 20 0v16" fill="none" stroke={g} strokeWidth="1" />,                                 // 1 arches
  (g) => <g fill="none" stroke={g} strokeWidth="1"><circle cx="0" cy="0" r="20" /><circle cx="40" cy="0" r="20" /><circle cx="0" cy="40" r="20" /><circle cx="40" cy="40" r="20" /><circle cx="20" cy="20" r="20" /></g>, // 2 rosettes
  (g) => <path d="M20 2l18 18-18 18L2 20z M20 12l8 8-8 8-8-8z" fill="none" stroke={g} strokeWidth="1" />,                                                // 3 diamonds
  (g) => <path d="M0 14q10-10 20 0t20 0M0 30q10-10 20 0t20 0" fill="none" stroke={g} strokeWidth="1" />,                                              // 4 waves
  (g) => <path d="M0 40a20 20 0 0 1 40 0M-20 20a20 20 0 0 1 40 0M20 20a20 20 0 0 1 40 0" fill="none" stroke={g} strokeWidth="1" />,                     // 5 scales
  (g) => <g fill={g}><circle cx="10" cy="10" r="1.8" /><circle cx="30" cy="30" r="1.8" /><circle cx="30" cy="10" r="1" /><circle cx="10" cy="30" r="1" /></g>, // 6 dots
  (g) => <path d="M0 10l10 10 10-10 10 10 10-10M0 30l10 10 10-10 10 10 10-10" fill="none" stroke={g} strokeWidth="1" />,                               // 7 zigzag
];

/** the words of the title in lines of at most `max` letters (a word is never cut) */
function wrap(title: string, max: number): string[] {
  const out: string[] = []; let cur = '';
  for (const w of title.split(/\s+/).filter(Boolean)) {
    if (cur && (cur + ' ' + w).length > max) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) out.push(cur);
  return out;
}
function layout(title: string) {
  for (const size of [34, 30, 26, 22, 19]) {
    const max = Math.floor(236 / (size * 0.55)); const lines = wrap(title, max);
    if (lines.length <= (size >= 30 ? 3 : 4) && lines.every((l) => l.length <= max + 1)) return { size, lines };
  }
  return { size: 17, lines: wrap(title, 22) };
}

export function BookCover({ title, author, kind, p, m, photo, className }: { title: string; author: string; kind: string; p: number; m: number; photo?: string; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, ''); const pal = PALETTES[p % PALETTES.length]; const motif = MOTIFS[m % MOTIFS.length];
  const { size, lines } = layout(title); const lh = size * 1.5; const y0 = 232 - ((lines.length - 1) * lh) / 2;
  const eye = kind.includes('فراسة');
  return (
    <svg className={className} viewBox="0 0 300 420" role="img" aria-label={`غلاف كتاب ${title}`} style={{ fontFamily: 'var(--font)' }}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={pal.a} /><stop offset="1" stopColor={pal.b} /></linearGradient>
        <pattern id={`p${id}`} width="40" height="40" patternUnits="userSpaceOnUse">{motif(pal.g)}</pattern>
        <clipPath id={`c${id}`}><rect width="300" height="420" rx="12" /></clipPath>
      </defs>
      <g clipPath={`url(#c${id})`}>
        <rect width="300" height="420" fill={`url(#g${id})`} />
        <rect width="300" height="420" fill={`url(#p${id})`} opacity=".22" />
        <rect x="0" y="0" width="22" height="420" fill="#000" opacity=".22" />
        <rect x="22" y="0" width="2" height="420" fill={pal.g} opacity=".5" />
      </g>
      {photo ? (
        <g clipPath={`url(#c${id})`}><image href={photo} x="0" y="0" width="300" height="420" preserveAspectRatio="xMidYMid meet" /></g>
      ) : (<>
      <rect x="40" y="18" width="246" height="384" rx="6" fill="none" stroke={pal.g} strokeWidth="1.6" />
      <rect x="46" y="24" width="234" height="372" rx="3" fill="none" stroke={pal.g} strokeWidth=".6" opacity=".7" />
      <text x="163" y="58" textAnchor="middle" fontSize="15" fontWeight="700" fill={pal.g}>{kind}</text>
      {eye
        ? <g transform="translate(163 112)"><path d="M-40 0Q0-30 40 0Q0 30-40 0Z" fill="none" stroke={pal.g} strokeWidth="2.4" /><circle r="12" fill={pal.g} /><circle r="5" fill={pal.b} /></g>
        : <g transform="translate(163 112)"><circle r="28" fill={pal.g} /><circle cx="11" r="25" fill={pal.a} /><path d="M24-4l3 8 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z" fill={pal.g} transform="translate(6 -6)" /></g>}
      <text textAnchor="middle" fontWeight="700" fontSize={size} fill={pal.t}>
        {lines.map((l, i) => <tspan key={i} x="163" y={y0 + i * lh}>{l}</tspan>)}
      </text>
      <path d="M96 332h54M176 332h54" stroke={pal.g} strokeWidth="1.2" /><path d="M163 326l6 6-6 6-6-6z" fill={pal.g} />
      <text x="163" y="370" textAnchor="middle" fontWeight="700" fontSize={author.length > 20 ? 14 : 17} fill={pal.g}>{author}</text>
      </>)}
    </svg>
  );
}
