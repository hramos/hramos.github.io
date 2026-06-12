// The full request-handling pipeline, shared by both entrypoints so behavior
// cannot drift. Works against Node-style (req, res) — which is what both the
// node:http server AND the Vercel Node serverless function provide.
//
// Pipeline: origin allowlist -> CORS/preflight -> method/path -> rate limit ->
// body parse + validate -> interpret. Errors are JSON.
import { checkOrigin, corsHeaders } from './cors.js';
import { createRateLimiter, clientIp, rateLimitFromEnv } from './rate-limit.js';
import { validatePayload } from './validate.js';
import { interpret, MOCK, MODEL } from './interpret.js';

// One limiter per process/instance.
const limiter = createRateLimiter();

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

// Read a raw request body from a Node stream. Vercel may have already parsed
// req.body; the entrypoint passes a pre-resolved body in that case.
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Normalize a request body into a parsed object. Handles: already-parsed object
// (Vercel), a JSON string, or a raw Node stream (local http). Returns the parsed
// payload or throws on invalid JSON.
async function parseBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    return JSON.parse(req.body);
  }
  const raw = await readBody(req);
  return JSON.parse(raw || '{}');
}

// Handle the interpret endpoint. The caller has already routed method+path for
// the local server; the Vercel function routes by file location, so we also
// guard the method here. `pathname` is optional (Vercel doesn't need it).
export async function handleInterpret(req, res) {
  const origin = req.headers.origin || req.headers.Origin;
  const { allowed, origin: echoOrigin } = checkOrigin(origin);

  // Disallowed browser origin: 403, NO CORS headers.
  if (!allowed) {
    send(res, 403, { error: 'Origin not allowed.' });
    return;
  }

  const cors = corsHeaders(echoOrigin);

  // Preflight.
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    send(res, 405, { error: 'Method not allowed.' }, cors);
    return;
  }

  // Rate limit (after CORS so allowed origins still get headers on 429).
  const rl = limiter.check(clientIp(req));
  if (!rl.allowed) {
    send(res, 429, { error: 'Rate limit exceeded. Slow down.' }, {
      ...cors,
      'Retry-After': String(rl.retryAfter),
    });
    return;
  }

  let payload;
  try {
    payload = await parseBody(req);
  } catch {
    send(res, 400, { error: 'Invalid JSON body.' }, cors);
    return;
  }

  const v = validatePayload(payload);
  if (!v.ok) {
    send(res, 400, { error: v.error }, cors);
    return;
  }

  try {
    const result = await interpret(v.value);
    send(res, 200, result, cors);
  } catch (err) {
    console.error('interpret failed:', err?.message || err);
    send(res, 502, { error: 'Interpretation failed. The chef is confused.' }, cors);
  }
}

// Health payload (used by the local server's /health route).
export function healthBody() {
  return { ok: true, mock: MOCK, model: MOCK ? null : MODEL, rateLimit: rateLimitFromEnv() };
}
