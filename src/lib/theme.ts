export type Theme = 'dark' | 'light';
const KEY = 'qs-theme';
/** the saved choice, else the system preference (the same rule the inline script in index.html applies before the first paint) */
export function initialTheme(): Theme {
  try { const t = localStorage.getItem(KEY); if (t === 'dark' || t === 'light') return t; } catch { /* storage may be blocked */ }
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function applyTheme(t: Theme, save = false) {
  document.documentElement.setAttribute('data-theme', t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#041412' : '#f6efdc');
  if (save) { try { localStorage.setItem(KEY, t); } catch { /* ignore */ } }
}
