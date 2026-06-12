# pbjt-server

LLM interpreter for the PB&J literal-instructions game (`/public/pbjt/`). It translates a
player's free-form English into **canonical game commands** that the client's existing
parser executes. The LLM never executes anything — it only rephrases. The OpenAI API key
stays server-side.

The system prompt is [`GAME.md`](./GAME.md), which teaches the model the game's purpose,
the literal-interpretation philosophy, and the full command/noun vocabulary.

## Setup

```bash
cp .env.example .env       # then add your OPENAI_API_KEY (or leave blank for mock mode)
npm install
npm run dev                # node --watch; or: npm run start
```

Requires Node 20+.

### Environment variables

| Var              | Default       | Purpose                                              |
| ---------------- | ------------- | ---------------------------------------------------- |
| `OPENAI_API_KEY`        | _(empty)_     | OpenAI key. Empty → mock mode.                                |
| `PBJT_MODEL`            | `gpt-4o-mini` | Model passed to the AI SDK.                                   |
| `PORT`                  | `8787`        | Listen port (local server only).                             |
| `PBJT_MOCK`             | _(empty)_     | Set to `1` to force mock mode even with a key set.           |
| `PBJT_ALLOWED_ORIGINS`  | `https://hectorramos.com,https://www.hectorramos.com` | Comma-separated browser origins allowed to call the API. |
| `PBJT_RATE_LIMIT`       | `20`          | Max requests per IP per minute before `429`.                 |

## Mock mode

When `PBJT_MOCK=1` **or** no `OPENAI_API_KEY` is set, the server skips OpenAI entirely and
returns `{ "commands": [instruction] }` — a pass-through. This keeps the game playable
end-to-end without a key (the client's parser already understands plain instructions). The
startup log says which mode is active.

## API

`POST /api/pbjt/interpret`

Request body:

```json
{
  "instruction": "open the peanut butter and grab the knife",
  "state": "everything sealed; no slices out",
  "history": [{ "instruction": "...", "response": "..." }]
}
```

`state` is a short plain-text world description the client generates. `history` is the last
≤6 exchanges (for pronoun context).

Success — `200`:

```json
{ "commands": ["open the peanut butter", "grab the knife"] }
```

`commands` is 1–3 canonical command strings, run in order by the client.

Errors — non-`2xx` with `{ "error": string }`: `400` for a malformed body or missing
`instruction`; `502` if the LLM call fails (e.g. bad API key).

`GET /health` returns `{ ok, mock, model, rateLimit }`.

## Abuse protection

The same logic runs in the local server and the Vercel function (it lives in [`lib/`](./lib/)).

**Origin allowlist (browser-level only).** Browser requests carry an `Origin` header. If it
isn't in `PBJT_ALLOWED_ORIGINS` (default `https://hectorramos.com,https://www.hectorramos.com`)
and isn't a `localhost`/`127.0.0.1` origin (always allowed, any port), the request gets a
`403` with **no** CORS headers. Allowed origins get the specific origin echoed back in
`Access-Control-Allow-Origin` (no longer `*`), correct `OPTIONS` preflight handling, and
`Vary: Origin`. Requests with **no** `Origin` header (curl, server-to-server) are always
allowed — this is browser-level protection, not auth against a determined non-browser caller.

**Rate limit.** In-memory fixed window per IP (`x-forwarded-for` first value on Vercel, socket
address locally), default `20`/min (`PBJT_RATE_LIMIT`). Excess gets `429` + `Retry-After`.
Serverless caveat: the counter is per-instance and resets on cold start, so it's a per-instance
cap, not a global quota — enough to stop naive credit-burning loops. OpenAI spend caps are the
real backstop.

## Deploy to Vercel

This server deploys as a Vercel project rooted at `server/`; the function file
[`api/pbjt/interpret.js`](./api/pbjt/interpret.js) maps to `/api/pbjt/interpret`. `GAME.md` is
bundled via `includeFiles` in [`vercel.json`](./vercel.json) (Node runtime, no build step).

```bash
npm i -g vercel
vercel login
cd server
vercel                       # first run: set Root Directory = server/ when prompted
# In the Vercel dashboard, set env vars (Production):
#   OPENAI_API_KEY, PBJT_MODEL, PBJT_ALLOWED_ORIGINS, PBJT_RATE_LIMIT
vercel --prod                # deploy; prints the production URL
```

Then point the game at it: paste the URL into `PROD_SERVER` at the top of
`public/pbjt/interpreter.js`, or append `?server=https://<your-deployment>.vercel.app` to the
`/pbjt` page URL (overrides `PROD_SERVER`; `?server=off` disables).

## curl example

```bash
# No Origin header (server-to-server / curl) -> always allowed.
curl -s -X POST localhost:8787/api/pbjt/interpret \
  -H 'content-type: application/json' \
  -d '{"instruction":"open the peanut butter","state":"everything sealed","history":[]}'
# mock mode -> {"commands":["open the peanut butter"]}

# Allowed browser origin -> 200 + Access-Control-Allow-Origin echoes the origin.
curl -s -i -X POST localhost:8787/api/pbjt/interpret \
  -H 'content-type: application/json' -H 'Origin: https://hectorramos.com' \
  -d '{"instruction":"open the peanut butter","history":[]}'

# Disallowed browser origin -> 403, no CORS headers.
curl -s -i -X POST localhost:8787/api/pbjt/interpret \
  -H 'content-type: application/json' -H 'Origin: https://evil.example' \
  -d '{"instruction":"x","history":[]}'

# Preflight from an allowed origin -> 204 + CORS headers.
curl -s -i -X OPTIONS localhost:8787/api/pbjt/interpret \
  -H 'Origin: https://hectorramos.com' -H 'Access-Control-Request-Method: POST'
```
