import type { Doc, Manifest, Tab } from './types';
import { kvGet, kvSet, kvKeys, kvDel } from './store';

const base = (import.meta as any).env?.BASE_URL ?? './';
/** Where updates are downloaded from (the repository's content/ folder, served by GitHub). Empty = no remote updates (plain web build). */
const REMOTE: string = ((import.meta as any).env?.VITE_CONTENT_URL ?? '').replace(/\/?$/, '/').replace(/^\/$/, '');
export const APK_VERSION: number = Number((import.meta as any).env?.VITE_APK_VERSION ?? 0);

const sha256 = async (buf: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
const parse = <T,>(buf: ArrayBuffer): T => JSON.parse(new TextDecoder('utf-8').decode(buf)) as T;

async function fetchBuf(url: string, noCache = false): Promise<ArrayBuffer | null> {
  const res = await fetch(url, noCache ? { cache: 'no-store' } : undefined);
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  if (/^\s*</.test(new TextDecoder().decode(buf.slice(0, 20)))) return null;       // an HTML fallback page means «not found»
  return buf;
}

export interface Content { manifest: Manifest; files: Map<string, ArrayBuffer>; fromStore: boolean; }

/** The content in use: the downloaded update when it is newer than the one bundled with the app, otherwise the bundled one. */
export async function loadContent(): Promise<Content> {
  const bundledBuf = await fetchBuf(`${base}content/manifest.json`, true);
  if (!bundledBuf) throw new Error('تعذّر تحميل فهرس المحتوى');
  const bundled = parse<Manifest>(bundledBuf);
  try {
    const stored = await kvGet<Manifest>('manifest');
    if (stored && stored.version > bundled.version) {
      const files = new Map<string, ArrayBuffer>(); let ok = true;
      for (const t of stored.tabs) if (t.file) { const b = await kvGet<ArrayBuffer>('file:' + t.sha256); if (b) files.set(t.file, b); else { ok = false; break; } }
      if (ok) return { manifest: stored, files, fromStore: true };
    }
  } catch { /* fall back to the bundled content */ }
  return { manifest: bundled, files: new Map(), fromStore: false };
}

/** Starts downloading every bundled file at once (the network overlaps with the indexing of the previous tab); loadTab takes each one when its turn comes. */
const early = new Map<string, Promise<ArrayBuffer | null>>();
export function prefetch(c: Content) {
  early.clear();
  for (const t of c.manifest.tabs) if (t.file && !c.files.has(t.file)) early.set(t.file, fetchBuf(`${base}content/${t.file}`).catch(() => null));
}

export async function loadTab(tab: Tab, c: Content): Promise<Doc[] | null> {
  if (!tab.file) return null;
  const pre = early.get(tab.file); early.delete(tab.file);
  const buf = c.files.get(tab.file) ?? (pre ? await pre : null) ?? (await fetchBuf(`${base}content/${tab.file}`));
  if (!buf) return null;
  const src = tab.id;
  if (tab.kind === 'quran') {
    const q = parse<{ surahs: { n: number; name: string }[]; a: [number, number, string][] }>(buf);
    const names = new Map(q.surahs.map((s) => [s.n, s.name]));
    return q.a.map(([s, a, t]) => ({ id: `${src}:${s}:${a}`, src, text: t, surah: s, ayah: a, surahName: names.get(s) ?? '' }));
  }
  if (tab.kind === 'hadith') {
    const j = parse<{ h: [number, string, string, string, string[], string, 'v' | 'h' | 'm' | 'l', number, number, string?][] }>(buf);
    return j.h.map(([page, , t, k, , g, tier, , n, printed], i) => ({ id: `${src}:${i}`, src, text: t, page, number: n || undefined, takhrij: k, grade: g, tier, ungraded: !g && /\)\s*$/.test(printed ?? '') ? 'unclear' : !g ? 'none' : undefined }));
  }
  if (tab.kind === 'poem') {
    const w = parse<{ h: [number, number, string, string, string, string?, number?][] }>(buf);   // [id number, page (0 = none), chapter, hemistich 1, hemistich 2, poem name?, verse number shown?]
    return w.h.map(([n, page, chapter, a, b, poem, shown]) => ({ id: `${src}:${n}`, src, text: `${a} ${b}`, verse: shown ?? n, page, chapter, shatr1: a, shatr2: b, poem }));
  }
  const g = parse<{ h: [string, string, string, string?, string?, string?, string?][] }>(buf);
  return g.h.map(([ref, text, explanation, source, by, who, extra], i) => ({ id: `${src}:${i}`, src, text, ref, explanation, source, by, who, extra }));
}

/** A file of the content that is not a tab (the text of a book of the reader): taken from the downloaded update, else from the copy bundled in the app when it is the right one, else downloaded now and kept. */
export async function loadContentFile(c: Content | null, rel: string): Promise<ArrayBuffer | null> {
  const f = c?.manifest.files?.find((x) => x.file === rel); if (!f) return null;
  try { const kept = await kvGet<ArrayBuffer>('file:' + f.sha256); if (kept) return kept; } catch { /* no store */ }
  const bundled = await fetchBuf(`${base}content/${rel}`).catch(() => null);
  if (bundled && (await sha256(bundled)) === f.sha256) return bundled;
  if (REMOTE) {
    const r = await fetchBuf(`${REMOTE}${rel}?v=${f.sha256.slice(0, 12)}`, true).catch(() => null);
    if (r && (await sha256(r)) === f.sha256) { try { await kvSet('file:' + f.sha256, r); } catch { /* keep going without caching */ } return r; }
  }
  return null;
}
export const parseJson = <T,>(buf: ArrayBuffer): T => parse<T>(buf);

export type UpdateResult = { status: 'none' | 'updated' | 'failed'; manifest?: Manifest; apkNotice?: Manifest['apk'] };

/** Checks the remote manifest and, when it is newer, downloads the files that changed, verifies each one (SHA-256) and stores them.
 *  The new manifest is stored last, so an interrupted download never leaves a half-updated app. */
export async function checkForUpdate(current: Manifest): Promise<UpdateResult> {
  if (!REMOTE) return { status: 'none' };
  try {
    const mb = await fetchBuf(`${REMOTE}manifest.json?t=${Date.now()}`, true);
    if (!mb) return { status: 'none' };
    const remote = parse<Manifest>(mb);
    const onIos = (window as any).Capacitor?.getPlatform?.() === 'ios';                       // an iPhone never installs an APK: its app comes from the App Store
    const apkNotice = !onIos && remote.apk && remote.apk.versionCode > APK_VERSION && remote.apk.url ? remote.apk : undefined;
    if (!remote.tabs || remote.version <= current.version) return { status: 'none', apkNotice };
    for (const t of remote.tabs) {
      if (!t.file || !t.sha256) continue;
      if (await kvGet<ArrayBuffer>('file:' + t.sha256)) continue;
      const buf = await fetchBuf(`${REMOTE}${t.file}?v=${t.sha256.slice(0, 12)}`, true);
      if (!buf) return { status: 'failed' };
      if ((await sha256(buf)) !== t.sha256) return { status: 'failed' };
      await kvSet('file:' + t.sha256, buf);
    }
    await kvSet('manifest', remote);
    const keep = new Set([...remote.tabs.filter((t) => t.sha256).map((t) => t.sha256), ...(remote.files ?? []).map((f) => f.sha256)].map((s) => "file:" + s));
    for (const k of (await kvKeys()) ?? []) if (typeof k === 'string' && k.startsWith('file:') && !keep.has(k)) await kvDel(k);
    return { status: 'updated', manifest: remote, apkNotice };
  } catch { return { status: 'failed' }; }
}
