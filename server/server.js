// Local dev entrypoint: a long-running node:http server on port 8787.
// All request-handling logic lives in ./lib/* and is shared verbatim with the
// Vercel serverless function (api/pbjt/interpret.js) so behavior can't drift.
import 'dotenv/config';
import { createServer } from 'node:http';
import { handleInterpret, healthBody } from './lib/handle.js';
import { MOCK, MODEL, mockReason } from './lib/interpret.js';
import { rateLimitFromEnv } from './lib/rate-limit.js';

const PORT = Number(process.env.PORT) || 8787;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(healthBody()));
    return;
  }

  if (url.pathname === '/api/pbjt/interpret') {
    // handleInterpret covers OPTIONS/POST/405 + origin + rate limit + body.
    await handleInterpret(req, res);
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found.' }));
});

server.listen(PORT, () => {
  const rl = rateLimitFromEnv();
  if (MOCK) {
    console.log(`[pbjt-server] MOCK MODE (${mockReason()}) — returning pass-through commands, no OpenAI calls. Listening on :${PORT} (rate limit ${rl}/min)`);
  } else {
    console.log(`[pbjt-server] LIVE — model=${MODEL}, listening on :${PORT} (rate limit ${rl}/min)`);
  }
});
