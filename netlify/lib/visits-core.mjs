// The visitors counter of the website: every device is counted ONCE, however often (and however long after) it comes back.
// A device is a random id the browser keeps for itself; only a hash of it is stored here, never anything about the person.
// Written against the small store interface of Netlify Blobs (set / getWithMetadata / setJSON with conditions / delete / get) so it can be tested without a server.
import { createHash } from 'node:crypto';

export const ID_RE = /^[0-9a-f]{32}$/;
const sha = (s) => createHash('sha256').update(s).digest('hex');
/** most new devices one network address may add in a day: a school, a mosque or an office behind one address passes, a script that invents ids is stopped after a few hundred */
export const DAILY_PER_ADDRESS = 300;

/** the total lives in 16 small counters (the device's hash picks one), so devices arriving together rarely write the same one; the total is their sum */
const SHARDS = 16;
/** crawlers, link previews, monitors and scripts are not visitors: they are never counted */
export const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp|telegrambot|curl|wget|python|node-fetch|axios|go-http|java\/|okhttp|httpclient|monitor|uptime|pingdom|gtmetrix|phantom|selenium|playwright|puppeteer/i;
export const isBot = (ua) => !ua || BOT_RE.test(String(ua));

export async function readTotal(store) {
  const parts = await Promise.all(Array.from({ length: SHARDS }, (_, i) => store.get('t/' + i, { type: 'json' }).catch(() => null)));
  return parts.reduce((a, v) => a + (Number.isFinite(v) && v > 0 ? v : 0), 0);
}

/** adds one to a counter, safely when several devices arrive together (the write succeeds only if nobody changed the counter in between) */
async function increment(store, shard) {
  const key = 't/' + shard;
  for (let i = 0; i < 30; i++) {
    const cur = await store.getWithMetadata(key, { type: 'json' });
    const r = cur ? await store.setJSON(key, (Number.isFinite(cur.data) ? cur.data : 0) + 1, { onlyIfMatch: cur.etag }) : await store.setJSON(key, 1, { onlyIfNew: true });
    if (r.modified) return true;
    await new Promise((x) => setTimeout(x, Math.random() * 25));
  }
  return false;
}

/** one visit of one device: → { counted, total } */
export async function visit(store, id, address, day, meta = {}) {
  if (!ID_RE.test(String(id))) return { error: 'bad id' };
  const dev = 'd/' + sha('device:' + id).slice(0, 40);
  const ip = 'ip/' + sha('ip:' + address).slice(0, 24) + '/' + day;
  if (await store.get(dev).catch(() => null)) return { counted: false, total: await readTotal(store) };           // already counted: nothing is written
  const used = Number(await store.get(ip).catch(() => 0)) || 0;
  if (used >= DAILY_PER_ADDRESS) return { counted: false, total: await readTotal(store) };
  const first = await store.set(dev, JSON.stringify({ t: meta.at || day, k: meta.kind || '?', s: meta.src || 'web' }), { onlyIfNew: true });   // when it first came from what kind of screen and from the website or the app: so the total can be audited later
  if (!first.modified) return { counted: false, total: await readTotal(store) };                                   // another request of the same device won the race
  const ok = await increment(store, parseInt(dev.slice(2, 4), 16) % SHARDS);
  if (!ok) { await store.delete(dev).catch(() => undefined); return { counted: false, total: await readTotal(store) }; }   // could not add: forget the device so its next visit counts
  await store.set(ip, String(used + 1)).catch(() => undefined);
  return { counted: true, total: await readTotal(store) };
}

/** the website itself and the app (it runs from https://localhost inside the phone) may call the counter from the browser; nobody else gets a cross-site permission */
export const ALLOWED_ORIGINS = ['https://almaktaba-alshamila-m2el.netlify.app', 'https://localhost', 'http://localhost', 'capacitor://localhost'];
export function corsHeaders(origin) {
  return ALLOWED_ORIGINS.includes(origin) ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' } : { vary: 'origin' };
}
