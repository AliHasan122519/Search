import { BookOpen, ScrollText, Quote, MoonStar } from 'lucide-react';
import type { Kind } from '../lib/types';
export const ICONS: Record<Kind, typeof BookOpen> = { quran: BookOpen, hadith: ScrollText, poem: MoonStar, generic: Quote };
