// Origin allowlist + CORS header logic, shared by both entrypoints.
//
// IMPORTANT: origin checks are BROWSER-LEVEL protection only. The Origin header
// is set by browsers, not by curl or server-to-server callers, so a request
// with NO Origin header is always allowed (see isOriginAllowed). This stops a
// hostile *web page* from burning your OpenAI credits via a visitor's browser;
// it is not a substitute for auth against a determined non-browser attacker.
// The real spend backstop is OpenAI's own usage caps.

// Comma-separated production origins. Default covers the apex + www.
const DEFAULT_ALLOWED = 'https://hectorramos.com,https://www.hectorramos.com';

export function allowedOrigins(env = process.env) {
  const raw = env.PBJT_ALLOWED_ORIGINS;
  const list = (raw && raw.trim() ? raw : DEFAULT_ALLOWED)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list;
}

// localhost / 127.0.0.1 / [::1] on ANY port is always allowed for local dev,
// regardless of the configured allowlist.
function isLocalhostOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname === '::1'
    );
  } catch {
    return false;
  }
}

// Decide whether a request's Origin is allowed.
//   - No Origin header (curl / server-to-server): allowed (browser-only check).
//   - localhost origin on any port: allowed.
//   - origin in the configured allowlist: allowed.
//   - anything else: denied.
// Returns { allowed, origin } where origin is the value to echo (or null when
// there's nothing to echo, e.g. no Origin header).
export function checkOrigin(origin, env = process.env) {
  if (!origin) return { allowed: true, origin: null };
  if (isLocalhostOrigin(origin)) return { allowed: true, origin };
  if (allowedOrigins(env).includes(origin)) return { allowed: true, origin };
  return { allowed: false, origin };
}

// Build the CORS headers for an ALLOWED request. When origin is null (no Origin
// header) we omit Access-Control-Allow-Origin entirely — there's nothing to
// echo and a non-browser caller doesn't need it. Always sets Vary: Origin so
// caches don't serve one origin's response to another.
export function corsHeaders(origin) {
  const headers = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}
