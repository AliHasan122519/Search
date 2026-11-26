// /api/visit  (POST {id}): counts the device once.   /api/visits (GET): the total.   Website only: the app never calls it.
import { getStore } from '@netlify/blobs';
import { visit, readTotal } from '../lib/visits-core.mjs';

const json = (body, status = 200, cache = 'no-store') => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache, ...(cache === 'no-store' ? {} : { 'netlify-cdn-cache-control': 'public, max-age=60, stale-while-revalidate=300' }) } });

export default async (req, context) => {
  const url = new URL(req.url);
  // ?dry=1 works on a separate test store, so the real total is never touched while the function is being checked
  const store = getStore({ name: url.searchParams.get('dry') ? 'visits-dry' : 'visits', consistency: 'strong' });
  try {
    if (req.method === 'GET') return json({ total: await readTotal(store) }, 200, 'public, max-age=0');
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    const body = await req.json().catch(() => ({}));
    const address = context?.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';
    const r = await visit(store, body?.id, address, new Date().toISOString().slice(0, 10));
    return json(r, r.error ? 400 : 200);
  } catch {
    return json({ error: 'unavailable' }, 503);
  }
};
export const config = { path: ['/api/visit', '/api/visits'] };
