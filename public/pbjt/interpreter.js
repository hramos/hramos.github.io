// Optional server-side LLM interpreter for free-text instructions.
//
// The game's local regex parser in game.js stays the executor AND the fallback.
// When a server is configured, free text is POSTed to it; the server returns
// 1-3 canonical commands that the SAME local parser executes. Any failure
// (no server, network error, timeout, bad shape) falls back to local parsing
// of the raw instruction. The static GitHub Pages build runs with zero server.

// Production server base. After deploying with `vercel --prod`, paste the
// deployment URL here (e.g. 'https://your-project.vercel.app') to make it the
// default on non-localhost hosts. Leave '' to keep production local-only (no
// fetches). Always overridable by ?server= and localStorage; ?server=off
// disables regardless.
const PROD_SERVER = '';

const LS_KEY = 'pbjt-server';

function ls() {
  // localStorage may be absent (some embeds) — guard every access.
  try { return typeof localStorage !== 'undefined' ? localStorage : null; }
  catch { return null; }
}

function hostname() {
  try { return (typeof location !== 'undefined' && location.hostname) || ''; }
  catch { return ''; }
}

function isLocalhost(h) {
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '0.0.0.0';
}

function queryServerParam() {
  try {
    if (typeof location === 'undefined' || !location.search) return null;
    const v = new URLSearchParams(location.search).get('server');
    return v == null ? null : v;
  } catch { return null; }
}

// Resolve the server base URL. Precedence:
//   1. ?server= URL query param. `?server=off` clears storage + disables.
//      Any other value is persisted to localStorage.
//   2. localStorage['pbjt-server']
//   3. '' on normal hosts; 'http://localhost:8787' when running on localhost.
// Empty string => local-only mode (no fetches).
export function serverBase() {
  const store = ls();
  const param = queryServerParam();
  if (param !== null) {
    if (param === 'off' || param === '') {
      if (store) { try { store.removeItem(LS_KEY); } catch { /* ignore */ } }
      return '';
    }
    if (store) { try { store.setItem(LS_KEY, param); } catch { /* ignore */ } }
    return param;
  }
  if (store) {
    let saved = null;
    try { saved = store.getItem(LS_KEY); } catch { /* ignore */ }
    if (saved) return saved;
  }
  // Non-browser / unknown hostname (e.g. the test harness) => local-only.
  return isLocalhost(hostname()) ? 'http://localhost:8787' : PROD_SERVER;
}

function validCommands(data) {
  if (!data || !Array.isArray(data.commands)) return null;
  const cmds = data.commands;
  if (cmds.length < 1 || cmds.length > 3) return null;
  for (const c of cmds) {
    if (typeof c !== 'string' || c.trim() === '') return null;
  }
  return cmds;
}

// POST the instruction (+ world state + recent history) to the server.
// Resolves to string[] of 1-3 commands on success, or null on ANY failure —
// the caller falls back to local parsing of the raw instruction when null.
export async function interpret(instruction, stateText, history) {
  const base = serverBase();
  if (!base) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${base}/api/pbjt/interpret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction,
        state: stateText || '',
        history: (history || []).slice(-6),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return validCommands(data);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
