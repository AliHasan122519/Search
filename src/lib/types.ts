export type Kind = 'quran' | 'hadith' | 'poem' | 'generic';
export type SourceId = string;                              // a tab id from the content manifest («quran», «jami», …); new ones can be added by a content update
export type MatchType = 'literal' | 'normalized' | 'textual' | 'derived' | 'semantic';
export interface Tab { id: SourceId; label: string; kind: Kind; file: string | null; sha256: string | null; count?: number; placeholder?: string; hint?: string; hidden?: boolean; card?: 'meaning' | 'verse' | 'dream' | 'person' | 'rule' | 'about' | 'library' | 'assistant'; unit?: string; l1?: string; l2?: string; sub?: string; smart?: 'dialect' | 'full'; drawer?: boolean; menu?: string; }
export interface ContentFile { file: string; sha256: string; size?: number; }
export interface Manifest { schema: number; version: number; updated?: string; apk?: { versionCode: number; url: string; notes?: string }; tabs: Tab[]; files?: ContentFile[]; }   // files: extra files opened on demand (the texts of the books of the reader)
export interface Doc {
  id: string; src: SourceId; text: string;
  surah?: number; surahName?: string; ayah?: number;                              // Qur'an
  page?: number; number?: number; takhrij?: string; grade?: string; ungraded?: 'unclear' | 'none'; tier?: 'v' | 'h' | 'm' | 'l';        // hadith
  chapter?: string; verse?: number; shatr1?: string; shatr2?: string; poem?: string;   // poem (verse number as printed, chapter title, the two hemistichs, name of the poem when the tab holds several)
  ref?: string; explanation?: string; source?: string; by?: string; who?: string; extra?: string;                                              // generic entries
}
export interface Hit { id: string; src: SourceId; ord: number; score: number; type: MatchType; via?: string; }
export interface SearchResult {
  query: string; hits: Hit[]; terms: string[]; root: string; related: string[]; highlight: Set<string>; ms: number;
}
export interface Lookup {
  query: string; directCount: number; semanticCount: number; expansion: { root: string; terms: string[] } | null; section?: string;
  results: { hit: Hit; doc: Doc; matchType: 'نصي' | 'دلالي'; matchedTerm: string; group?: 'meaning' | 'mention' }[]; highlight: Set<string>; capped: boolean;
  symbol?: string;                                                  // the words that name what was searched (books tab)
  dialect?: { from: string; to: string[]; kind: 'dialect' | 'synonym' }[];                      // colloquial words understood as standard Arabic
  groups?: { meaning: number; mention: number };   // books tab: what the sources say the symbol means
}
