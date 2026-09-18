import { guard, corsHeaders } from "./_guard.js";

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const cors = corsHeaders(req);

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  // Auth + atomic credit charge (skipped while the launch gate is off — see _pricing.js).
  const action = req.headers.get('x-mv-action') || 'misc';
  const g = await guard(req, action);
  if (!g.ok) {
    return new Response(JSON.stringify({ error: g.error }), {
      status: g.status, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const body = await req.json();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  const headers = { 'Content-Type': 'application/json', ...cors };
  if (g.balance != null) headers['x-mv-balance'] = String(g.balance);
  return new Response(JSON.stringify(data), { status: response.status, headers });
}
