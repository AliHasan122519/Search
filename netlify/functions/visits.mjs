// /api/visit  (POST {id}): counts the device once.   /api/visits (GET): the total.   Website only: the app never calls it.
// /api/visit-test and /api/visits-test do the same on a separate test store, so the real total is never touched while the function is checked.
import { getStore } from '@netlify/blobs';
import { visit, readTotal, isBot } from '../lib/visits-core.mjs';

// never cached anywhere: the number shown is always the number counted at that moment
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'netlify-cdn-cache-control': 'no-store' } });

export default async (req, context) => {
  const url = new URL(req.url);
  const test = url.pathname.endsWith('-test');
  const store = getStore({ name: test ? 'visits-test' : 'visits-v3', consistency: 'strong' });
  try {
    if (req.method === 'GET') return json({ total: await readTotal(store) });
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    const body = await req.json().catch(() => ({}));
    const address = context?.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';
    const ua = req.headers.get('user-agent');
    if (isBot(ua)) return json({ counted: false, total: await readTotal(store), reason: 'not a visitor' });
    const now = new Date().toISOString(); const kind = /mobi|android|iphone|ipad/i.test(ua) ? 'm' : 'd';
    const r = await visit(store, body?.id, address, now.slice(0, 10), { at: now, kind });
    return json(r, r.error ? 400 : 200);
  } catch {
    return json({ error: 'unavailable' }, 503);
  }
};
export const config = { path: ['/api/visit', '/api/visits', '/api/visit-test', '/api/visits-test'] };
