import { registerPlugin } from '@capacitor/core';

export type SaveResult = 'started' | 'saved' | 'opened';
interface Native {
  download(o: { url: string; filename: string; mime?: string }): Promise<{ status: 'started'; where: 'downloads' | 'app' }>;
  saveText(o: { filename: string; text: string }): Promise<{ status: 'saved'; where: 'downloads' | 'app' }>;
}
const isNative = () => !!(window as any).Capacitor?.isNativePlatform?.();
const hook = () => (window as any).__qsDownloader as { download: Native['download']; saveText: Native['saveText'] } | undefined;      // lets tests replace the native part

/** a name Android and Windows accept for a file */
export const fileName = (title: string, ext: string) => `${title.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)}.${ext}`;

function anchor(href: string, name: string, blank: boolean) {
  const a = document.createElement('a'); a.href = href; a.download = name; if (blank) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  document.body.appendChild(a); a.click(); a.remove();
}

/** The app's own saving of a file: in the Android app the file downloads in the background and lands in «Downloads» without leaving the app; in a browser it is a normal download. */
export async function downloadFile(url: string, filename: string): Promise<SaveResult> {
  const h = hook(); if (h) return (await h.download({ url, filename, mime: 'application/pdf' })).status;
  if (isNative()) { const p = registerPlugin<Native>('FileDownloader'); return (await p.download({ url, filename, mime: 'application/pdf' })).status; }
  anchor(url, filename, true); return 'opened';
}

/** Saves a text made by the app (the text of a book as a .txt file). */
export async function saveTextFile(filename: string, text: string): Promise<SaveResult> {
  const h = hook(); if (h) return (await h.saveText({ filename, text })).status;
  if (isNative()) { const p = registerPlugin<Native>('FileDownloader'); return (await p.saveText({ filename, text })).status; }
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/plain;charset=utf-8' }));
  anchor(url, filename, false); setTimeout(() => URL.revokeObjectURL(url), 10000); return 'saved';
}
