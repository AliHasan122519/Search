/**
 * The visitors counter of the WEBSITE (never of the app): each device is counted once, however often it comes back.
 * The device is a random id the browser keeps (in its storage and in a cookie); the server keeps only a hash of it and adds one to the total the first time it sees it.
 * Once a device has been counted it never asks again, so a returning visitor costs nothing.
 */
import { APK_VERSION } from './data';

const ID = 'siraj-device-id', DONE = 'siraj-device-counted';
const cookie = (k: string) => { try { return new RegExp('(?:^|; )' + k + '=([^;]*)').exec(document.cookie)?.[1] ?? null; } catch { return null; } };
const setCookie = (k: string, v: string) => { try { document.cookie = `${k}=${v}; max-age=315360000; path=/; SameSite=Lax`; } catch { /* no cookies */ } };
const getStore = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const setStore = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage refused */ } };

/** only the website counts: not the Android/iOS app (built with a version number, or running inside Capacitor) */
export const isWebsite = () => typeof window !== 'undefined' && APK_VERSION === 0 && !(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() && /^https?:$/.test(location.protocol);

function deviceId(): string | null {
  const have = getStore(ID) ?? cookie(ID); if (have && /^[0-9a-f]{32}$/.test(have)) { setStore(ID, have); setCookie(ID, have); return have; }
  const b = new Uint8Array(16); try { crypto.getRandomValues(b); } catch { return null; }
  const id = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  setStore(ID, id); setCookie(ID, id);
  return getStore(ID) === id || cookie(ID) === id ? id : null;            // a browser that keeps nothing cannot be told apart from a new device on every visit: it is not counted
}

export async function countVisit(): Promise<void> {
  if (!isWebsite()) return;
  if (getStore(DONE) === '1' || cookie(DONE) === '1') return;
  const id = deviceId(); if (!id) return;
  try {
    const r = await fetch('/api/visit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
    if (r.ok) { setStore(DONE, '1'); setCookie(DONE, '1'); }
  } catch { /* offline or the counter is down: tried again at the next visit */ }
}

export async function readVisits(): Promise<number | null> {
  if (!isWebsite()) return null;
  try { const r = await fetch('/api/visits'); if (!r.ok) return null; const j = (await r.json()) as { total?: number }; return Number.isFinite(j.total) ? (j.total as number) : null; } catch { return null; }
}
