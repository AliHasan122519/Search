/** Tiny IndexedDB key-value store for content downloaded by an update (manifest + data files). Failures never break the app: it then runs on the bundled content. */
const DB = 'qs-content', ST = 'kv';
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(ST, mode); const rq = f(t.objectStore(ST));
    t.oncomplete = () => { db.close(); res(rq ? (rq as IDBRequest<T>).result : undefined); }; t.onerror = () => { db.close(); rej(t.error); }; t.onabort = () => { db.close(); rej(t.error); };
  });
}
export const kvGet = <T,>(k: string) => tx<T>('readonly', (s) => s.get(k)).catch(() => undefined);
export const kvSet = (k: string, v: unknown) => tx('readwrite', (s) => { s.put(v, k); });
export const kvKeys = () => tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).catch(() => [] as IDBValidKey[]);
export const kvDel = (k: string) => tx('readwrite', (s) => { s.delete(k); });
