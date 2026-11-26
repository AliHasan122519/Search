// /api/visit  (POST {id, src}): counts the device once.   /api/visits (GET): the total.   One total for the website and the app: each device, on either, is counted once.
// /api/visit-test and /api/visits-test do the same on a separate test store, so the real total is never touched while the function is checked.
import { getStore } from '@netlify/blobs';
import { visit, readTotal, isBot, corsHeaders } from '../lib/visits-core.mjs';

// never cached anywhere: the number shown is always the number counted at that moment
const json = (body, status = 200, cors = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'netlify-cdn-cache-control': 'no-store', ...cors } });

export default async (req, context) => {
  const url = new URL(req.url); const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const test = url.pathname.endsWith('-test');
  const store = getStore({ name: test ? 'visits-test' : 'visits-v3', consistency: 'strong' });
  try {
    if (req.method === 'GET') return json({ total: await readTotal(store) }, 200, cors);
    if (req.method !== 'POST') return json({ error: 'method' }, 405, cors);
    const body = await req.json().catch(() => ({}));
    const address = context?.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';
    const ua = req.headers.get('user-agent');
    if (isBot(ua)) return json({ counted: false, total: await readTotal(store), reason: 'not a visitor' }, 200, cors);
    const now = new Date().toISOString(); const kind = /mobi|android|iphone|ipad/i.test(ua) ? 'm' : 'd';
    const src = body?.src === 'app' ? 'app' : 'web';
    const r = await visit(store, body?.id, address, now.slice(0, 10), { at: now, kind, src });
    return json(r, r.error ? 400 : 200, cors);
  } catch {
    return json({ error: 'unavailable' }, 503, cors);
  }
};
export const config = { path: ['/api/visit', '/api/visits', '/api/visit-test', '/api/visits-test'] };
