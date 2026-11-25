import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, initialTheme, type Theme } from '../lib/theme';

/** Round button fixed at the top corner: switches the whole app between the dark and the light theme and remembers the choice. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.getAttribute('data-theme') as Theme | null) ?? initialTheme());
  useEffect(() => { applyTheme(theme); }, [theme]);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'light' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن';
  return (
    <button type="button" className="theme-toggle" aria-label={label} title={label} data-theme-now={theme} onClick={() => { setTheme(next); applyTheme(next, true); }}>
      {theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
    </button>
  );
}
