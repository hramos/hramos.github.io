// Vercel Node serverless function. The Vercel project root is `server/`, so
// this file maps to the route /api/pbjt/interpret.
//
// All logic lives in ../../lib/* — shared verbatim with the local dev server
// (server/server.js) so the two can't drift. GAME.md is loaded relative to the
// lib module (see lib/game-prompt.js) and bundled via includeFiles in
// vercel.json so it's readable in the serverless environment.
import { handleInterpret } from '../../lib/handle.js';

export default async function handler(req, res) {
  return handleInterpret(req, res);
}
