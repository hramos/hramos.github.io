// Request-body validation, shared by both entrypoints.

// Validate a parsed payload. Returns { ok: true, value } or { ok: false, error }.
export function validatePayload(payload) {
  const { instruction, state = '', history = [] } = payload || {};
  if (typeof instruction !== 'string' || !instruction.trim()) {
    return { ok: false, error: 'Field "instruction" must be a non-empty string.' };
  }
  return { ok: true, value: { instruction, state, history } };
}
