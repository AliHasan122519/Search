// node tests/visits.mjs : the visitors counter counts every device once, also when many arrive together
import { visit, readTotal, DAILY_PER_ADDRESS, isBot, corsHeaders } from '../netlify/lib/visits-core.mjs';
// an in-memory stand-in for the Netlify Blobs store, with the same conditional writes
function fakeStore() {
  const m = new Map(); let ver = 0;
  const wait = () => new Promise((r) => setTimeout(r, Math.random() * 2));
  return {
    async get(k, o) { await wait(); const v = m.get(k); if (!v) return null; return o?.type === 'json' ? JSON.parse(v.v) : v.v; },
    async getWithMetadata(k, o) { await wait(); const v = m.get(k); if (!v) return null; return { data: o?.type === 'json' ? JSON.parse(v.v) : v.v, etag: v.e }; },
    async set(k, val, o = {}) { await wait(); const cur = m.get(k); if (o.onlyIfNew && cur) return { modified: false }; if (o.onlyIfMatch && (!cur || cur.e !== o.onlyIfMatch)) return { modified: false }; m.set(k, { v: String(val), e: 'e' + ++ver }); return { modified: true }; },
    async setJSON(k, val, o) { return this.set(k, JSON.stringify(val), o); },
    async delete(k) { m.delete(k); },
  };
}
for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'WhatsApp/2.23', 'curl/8.4', 'python-requests/2.31', 'HeadlessChrome/120', '', null, 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Playwright/1.4']) if (!isBot(ua)) { console.log('✗ should be a bot:', ua); process.exitCode = 1; }
for (const ua of ['Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36']) if (isBot(ua)) { console.log('✗ a real browser was taken for a bot:', ua); process.exitCode = 1; }
for (const o of ['https://localhost', 'capacitor://localhost', 'https://almaktaba-alshamila-m2el.netlify.app']) if (corsHeaders(o)['access-control-allow-origin'] !== o) { console.log('✗ origin refused:', o); process.exitCode = 1; }
for (const o of ['https://evil.example', null, 'null']) if (corsHeaders(o)['access-control-allow-origin']) { console.log('✗ origin allowed:', o); process.exitCode = 1; }
let bad = 0; const check = (ok, msg) => { if (!ok) { bad++; console.log('✗', msg); } };
const hex = (i) => (i.toString(16).padStart(8, '0') + 'a1b2c3d4e5f60718293a4b5c').slice(0, 32);
const s = fakeStore();
check((await visit(s, 'not-an-id', '1.1.1.1', '2026-01-01')).error, 'a bad id must be refused');
let r = await visit(s, hex(1), '1.1.1.1', '2026-01-01'); check(r.counted && r.total === 1, 'the first device counts as 1');
for (let k = 0; k < 5; k++) { r = await visit(s, hex(1), '1.1.1.1', '2026-01-0' + (k + 2)); check(!r.counted && r.total === 1, 'the same device again (another day too) must not count'); }
r = await visit(s, hex(2), '2.2.2.2', '2026-01-01'); check(r.counted && r.total === 2, 'a second device makes 2');
// 120 devices arriving at the same moment, each one sending its visit three times
const t = fakeStore(); const jobs = [];
for (let i = 0; i < 120; i++) for (let k = 0; k < 3; k++) jobs.push(visit(t, hex(1000 + i), `10.0.${i % 50}.${i % 200}`, '2026-02-01'));
await Promise.all(jobs); const total = await readTotal(t); console.log('120 devices x3 visits at once → total', total); check(total === 120, `120 devices must count 120, got ${total}`);
// a script inventing ids from one address is stopped at the daily limit
const u = fakeStore(); let counted = 0; for (let i = 0; i < DAILY_PER_ADDRESS + 20; i++) if ((await visit(u, hex(5000 + i), '9.9.9.9', '2026-03-01')).counted) counted++;
check(counted === DAILY_PER_ADDRESS, `one address must add at most ${DAILY_PER_ADDRESS} a day, added ${counted}`);
const next = await visit(u, hex(9999), '9.9.9.9', '2026-03-02'); check(next.counted, 'the next day the address may add again');
console.log(bad ? `\n${bad} failed` : '\nall visitor-counter checks passed'); process.exit(bad ? 1 : 0);
