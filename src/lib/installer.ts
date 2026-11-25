import { registerPlugin } from '@capacitor/core';

export type InstallResult = 'installing' | 'needs_permission' | 'opened';
export interface Installer { install(url: string, onProgress: (percent: number) => void): Promise<InstallResult>; }

interface ApkPlugin { install(o: { url: string }): Promise<{ status: 'installing' | 'needs_permission' }>; addListener(ev: 'progress', cb: (e: { percent: number }) => void): Promise<{ remove: () => Promise<void> }>; }
const isNative = () => !!(window as any).Capacitor?.isNativePlatform?.();

/** In the Android app: downloads the new APK inside the app and opens Android's installer. Elsewhere (or if the native part is missing): opens the download link. */
export function getInstaller(): Installer {
  const hook = (window as any).__qsInstaller as Installer | undefined;          // lets tests replace the native part
  if (hook) return hook;
  return {
    async install(url, onProgress) {
      if (isNative()) {
        try {
          const p = registerPlugin<ApkPlugin>('ApkInstaller'); const h = await p.addListener('progress', (e) => onProgress(e.percent));
          try { return (await p.install({ url })).status; } finally { await h.remove(); }
        } catch (e) { if (!/not implemented|not available|UNIMPLEMENTED/i.test(String((e as any)?.message ?? e))) throw e; }
      }
      window.open(url, '_blank', 'noopener'); return 'opened';
    },
  };
}

interface StagePlugin { canInstall(): Promise<{ allowed: boolean }>; download(o: { url: string; commitOnLeave: boolean }): Promise<{ status: 'ready' }>; commit(): Promise<{ status: 'installing' | 'needs_permission' }>; addListener(ev: 'progress', cb: (e: { percent: number }) => void): Promise<{ remove: () => Promise<void> }>; }

/** Automatic updates (Android app only; null elsewhere): the new APK is downloaded and checked quietly in the background, then installed the moment the user leaves the app. */
export interface AutoUpdater { canInstall(): Promise<boolean>; stage(url: string): Promise<void>; commit(): Promise<'installing' | 'needs_permission'>; }
export function getAutoUpdater(): AutoUpdater | null {
  const hook = (window as any).__qsAutoUpdater as AutoUpdater | undefined;      // lets tests replace the native part
  if (hook) return hook;
  if (!isNative()) return null;
  const p = registerPlugin<StagePlugin>('ApkInstaller');
  return {
    async canInstall() { try { return (await p.canInstall()).allowed; } catch { return false; } },
    async stage(url) { await p.download({ url, commitOnLeave: true }); },
    async commit() { return (await p.commit()).status; },
  };
}
