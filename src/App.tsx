import { useCallback, useEffect, useRef, useState } from 'react';
import { countVisit } from './lib/visits';
import { Download } from 'lucide-react';
import { ThemeToggle } from './components/ThemeToggle';
import { UpdateDialog } from './components/UpdateDialog';
import { MenuButton, Drawer } from './components/Drawer';
import { DreamsPanel } from './components/DreamsPanel';
import { PeoplePanel } from './components/PeoplePanel';
import { RulesPanel } from './components/RulesPanel';
import { LibraryPanel } from './components/LibraryPanel';
import { AssistantPanel } from './components/AssistantPanel';
import { Engine } from './lib/engine';
import { loadContent, loadTab, loadContentFile, prefetch, checkForUpdate, type Content } from './lib/data';
import type { Doc, Kind, Manifest, SourceId } from './lib/types';
type SourceState = 'loading' | 'ready' | 'absent' | 'error';

/** every dream with a named interpreter: the list of the books, and the Qur'an's and the Sunnah's own dreams of the second list (the passages of the books it repeats are not counted twice) */
const dreamsOf = (lists: Record<string, Doc[]>): Doc[] => [...(lists.ruaa ?? []), ...(lists.anbiya ?? []).filter((d) => /^(?:القرآن|الجامع)/.test(d.source ?? ''))];

export function App() {
  const [engine, setEngine] = useState(() => new Engine());
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [tab, setTab] = useState<SourceId>('quran');
  const tabNow = useRef<SourceId>('quran');
  const [states, setStates] = useState<Record<SourceId, SourceState>>({});
  const [attempt, setAttempt] = useState(0);
  const [apkNotice, setApkNotice] = useState<Manifest['apk']>();
  const [dialog, setDialog] = useState(false);          // the «update available» dialog
  const shown = useRef(0);                                // versionCode whose dialog was already shown in this run (a «لاحقاً» is not asked again until the next launch)
  /** a newer app exists: tell the user inside the app; «تحديث الآن» downloads it, checks it and opens Android's installer, the user confirms */
  const onApk = useCallback((n: NonNullable<Manifest['apk']>) => {
    setApkNotice(n);
    if (shown.current !== n.versionCode) { shown.current = n.versionCode; setDialog(true); }
  }, []);
  const [toast, setToast] = useState('');
  const [menu, setMenu] = useState(false);                    // the side menu
  const [panel, setPanel] = useState<SourceId | null>(null);   // the list opened from the side menu («رؤى وتعبيرها»)
  const [lists, setLists] = useState<Record<SourceId, Doc[]>>({});   // the content of the tabs that live in the side menu instead of the tab bar
  const content = useRef<Content | null>(null);
  useEffect(() => { tabNow.current = tab; }, [tab]);
  useEffect(() => { const t = window.setTimeout(() => { void countVisit(); }, 3000); return () => window.clearTimeout(t); }, []);   // the website counts each device once (the app does not count)
  const loadFile = useCallback((rel: string) => loadContentFile(content.current, rel), []);          // the text of a book of the reader (opened on demand)
  const lastCheck = useRef(Date.now());

  // 1) load the content in use (bundled, or a newer downloaded one) and index every tab
  useEffect(() => {
    let dead = false;
    const eng = engine;
    (async () => {
      let c: Content;
      try { c = await loadContent(); } catch { if (!dead) setStates({ quran: 'error' }); return; }
      if (dead) return;
      content.current = c; setManifest(c.manifest);
      setStates(Object.fromEntries(c.manifest.tabs.map((t) => [t.id, 'loading' as SourceState])));
      setTab((cur) => (c.manifest.tabs.some((t) => t.id === cur && !t.drawer) ? cur : c.manifest.tabs.find((t) => !t.drawer)?.id ?? cur));
      prefetch(c);
      // the order of indexing: the first tab, then the small lists of the side menu, then the rest; whichever tab the user opens meanwhile jumps the queue
      const all = c.manifest.tabs; const firstTab = all.find((t) => !t.drawer);
      const queue = [...(firstTab ? [firstTab] : []), ...all.filter((t) => t.drawer), ...all.filter((t) => !t.drawer && t !== firstTab)];
      while (queue.length) {
        const i = queue.findIndex((q) => q.id === tabNow.current); const t = queue.splice(i > 0 ? i : 0, 1)[0];
        const set = (s: SourceState) => !dead && setStates((p) => ({ ...p, [t.id]: s }));
        try {
          const docs = await loadTab(t, c);
          if (dead) return;
          if (!docs) { set('absent'); continue; }
          if (t.drawer) { setLists((p) => ({ ...p, [t.id]: docs })); performance.mark('tab:' + t.id); set('ready'); continue; }      // not searched with the tabs: shown by the side menu
          await eng.addSource(t.id, docs, t.kind, { refFirst: t.card === 'meaning', smart: t.smart, cap: t.card === 'verse' ? 200 : undefined }); await eng.finalize(); performance.mark('tab:' + t.id); set('ready');
        } catch { set('error'); }
      }
      if (dead) return;
      // 2) in the background: look for newer content (only in builds that have a content URL, i.e. the Android app)
      lastCheck.current = Date.now();
      const r = await checkForUpdate(c.manifest);
      if (dead) return;
      if (r.apkNotice) onApk(r.apkNotice);
      if (r.status === 'updated') { setEngine(new Engine()); setAttempt((a) => a + 1); setToast('تم تحديث المحتوى تلقائياً'); setTimeout(() => setToast(''), 5000); }          // re-index with the new content
    })();
    return () => { dead = true; };
  }, [engine, attempt]);

  // 3) while the app stays installed the user may leave it open or come back to it: look again when it returns to the screen (at most every 15 minutes)
  useEffect(() => {
    const again = async () => {
      if (document.visibilityState !== 'visible' || !content.current || Date.now() - lastCheck.current < 15 * 60 * 1000) return;
      lastCheck.current = Date.now();
      const r = await checkForUpdate(content.current.manifest);
      if (r.apkNotice) onApk(r.apkNotice);
      if (r.status === 'updated') { setEngine(new Engine()); setAttempt((n) => n + 1); setToast('تم تحديث المحتوى تلقائياً'); setTimeout(() => setToast(''), 5000); }
    };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, []);

  const all = manifest?.tabs ?? [{ id: 'quran', label: 'القرآن الكريم', kind: 'quran' as Kind, file: null, sha256: null }];
  const side = all.filter((t) => t.drawer && !t.hidden && t.card !== 'assistant');          // the lists of the side menu
  const home = all.find((t) => t.card === 'assistant');                                         // the assistant is the home screen
  const opened = side.find((t) => t.id === panel);
  return (
    <main className="page">
      <ThemeToggle />
      {side.length > 0 && <MenuButton open={menu} onClick={() => setMenu(true)} />}
      <Drawer open={menu} items={side.map((t) => ({ id: t.id, label: t.menu ?? t.label }))} onPick={(id) => { setMenu(false); setPanel(id); }} onClose={() => setMenu(false)} />
      {opened && (opened.card === 'person'
        ? <PeoplePanel title={opened.label} people={lists[opened.id] ?? []} dreams={dreamsOf(lists)} onClose={() => setPanel(null)} />
        : opened.card === 'rule'
          ? <RulesPanel title={opened.label} docs={lists[opened.id] ?? []} unit={opened.unit} sub={opened.sub} l1={opened.l1} l2={opened.l2} onClose={() => setPanel(null)} />
          : opened.card === 'library'
          ? <LibraryPanel title={opened.label} sub={opened.sub} docs={lists[opened.id] ?? []} load={loadFile} onClose={() => setPanel(null)} />
          : <DreamsPanel title={opened.label} docs={lists[opened.id] ?? []} onClose={() => setPanel(null)} />)}
      {apkNotice && <button type="button" className="apk-notice" onClick={() => setDialog(true)}><Download size={16} />يتوفر إصدار جديد — اضغط للتحديث</button>}
      {apkNotice && dialog && <UpdateDialog apk={apkNotice} onClose={() => setDialog(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
      {home && <AssistantPanel home title={home.label} phrases={lists[home.id] ?? []} lists={lists} engine={engine} load={loadFile} onClose={() => undefined} />}
    </main>
  );
}
