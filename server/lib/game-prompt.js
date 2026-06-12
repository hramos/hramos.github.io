// GAME.md loading (the LLM system prompt) + user-message construction.
//
// GAME.md must be readable from BOTH entrypoints: the local node:http server
// (server/server.js) and the Vercel serverless function
// (server/api/pbjt/interpret.js). We resolve it relative to THIS module via
// import.meta.url so the path is identical regardless of caller cwd, and so
// Vercel bundles it when this module is traced (reinforced by includeFiles in
// vercel.json). GAME.md sits one directory up from server/lib/.
import { readFileSync } from 'node:fs';

// Read once at module load. Both entrypoints import this module, so the file is
// read a single time per process/instance.
export const SYSTEM_PROMPT = readFileSync(new URL('../GAME.md', import.meta.url), 'utf8');

// Build the user-facing prompt from the request payload.
export function buildUserMessage({ instruction, state, history }) {
  const lines = [];
  lines.push(`Current kitchen state: ${state || '(none provided)'}`);
  if (Array.isArray(history) && history.length) {
    lines.push('\nRecent exchanges:');
    for (const h of history.slice(-6)) {
      lines.push(`- player: "${h.instruction}" -> chef: "${h.response}"`);
    }
  }
  lines.push(`\nPlayer instruction to translate: "${instruction}"`);
  return lines.join('\n');
}
