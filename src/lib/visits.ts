/**
 * The visitors counter, one for the WEBSITE and the APP together: each device, on either of them, is counted once however often it comes back.
 * The device is a random id the browser (or the app's own web view) keeps for itself; the server keeps only a hash of it and adds one to the total the first time it sees it.
 * Once a device has been counted it never asks again, so a returning visitor costs nothing. A phone that has both the app and the site is two devices here (two storages).
 */
import { APK_VERSION } from './data';

const ID = 'siraj-device-id', DONE = 'siraj-device-counted';
const cookie = (k: string) => { try { return new RegExp('(?:^|; )' + k + '=([^;]*)').exec(document.cookie)?.[1] ?? null; } catch { return null; } };
const setCookie = (k: string, v: string) => { try { document.cookie = `${k}=${v}; max-age=315360000; path=/; SameSite=Lax`; } catch { /* no cookies */ } };
const getStore = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const setStore = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage refused */ } };

/** inside the app (Capacitor's web view, or built with a version number) or on the website */
const inApp = () => APK_VERSION > 0 || !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
/** the app has no server of its own: it asks the website's counter by its full address; the website asks its own */
const base = (): string => (inApp() ? String((import.meta as { env?: { VITE_COUNT_URL?: string } }).env?.VITE_COUNT_URL ?? '') : '/api/');
export const countingOn = () => typeof window !== 'undefined' && (inApp() ? base() !== '' : /^https?:$/.test(location.protocol));

function deviceId(): string | null {
  const have = getStore(ID) ?? cookie(ID); if (have && /^[0-9a-f]{32}$/.test(have)) { setStore(ID, have); setCookie(ID, have); return have; }
  const b = new Uint8Array(16); try { crypto.getRandomValues(b); } catch { return null; }
  const id = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  setStore(ID, id); setCookie(ID, id);
  return getStore(ID) === id || cookie(ID) === id ? id : null;            // a browser that keeps nothing cannot be told apart from a new device on every visit: it is not counted
}

/** counts a visit only when a person is really there: not an automated browser, and only once the page is on screen (not prerendered or in a background tab) */
export function countWhenVisible(): () => void {
  if (!countingOn() || (navigator as { webdriver?: boolean }).webdriver) return () => undefined;
  let timer = 0; const run = () => { timer = window.setTimeout(() => { void countVisit(); }, 3000); };
  const onVis = () => { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', onVis); run(); } };
  if (document.visibilityState === 'visible') run(); else document.addEventListener('visibilitychange', onVis);
  return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); };
}

async function countVisit(): Promise<void> {
  if (!countingOn()) return;
  if (getStore(DONE) === '1' || cookie(DONE) === '1') return;
  const id = deviceId(); if (!id) return;
  try {
    const r = await fetch(base() + 'visit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, src: inApp() ? 'app' : 'web' }) });
    if (r.ok) { setStore(DONE, '1'); setCookie(DONE, '1'); }
  } catch { /* offline or the counter is down: tried again at the next visit */ }
}

export async function readVisits(): Promise<number | null> {
  if (!countingOn()) return null;
  try { const r = await fetch(base() + 'visits', { cache: 'no-store' }); if (!r.ok) return null; const j = (await r.json()) as { total?: number }; return Number.isFinite(j.total) ? (j.total as number) : null; } catch { return null; }
}
