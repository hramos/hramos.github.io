// The interpret call: mock pass-through OR the Vercel AI SDK generateObject
// call. Shared by both entrypoints so behavior cannot drift.
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { SYSTEM_PROMPT, buildUserMessage } from './game-prompt.js';

export const MODEL = process.env.PBJT_MODEL || 'gpt-4o-mini';
const API_KEY = process.env.OPENAI_API_KEY;
export const MOCK = process.env.PBJT_MOCK === '1' || !API_KEY;

const commandsSchema = z.object({
  commands: z.array(z.string()).min(1).max(3),
});

// Lazily create the client only when live, on first use. (Serverless instances
// reuse it across warm invocations.)
let openai;
function client() {
  if (!openai) openai = createOpenAI({ apiKey: API_KEY });
  return openai;
}

export async function interpret({ instruction, state, history }) {
  if (MOCK) {
    // Pass-through: the client's own parser handles the raw text.
    return { commands: [instruction] };
  }
  const { object } = await generateObject({
    model: client()(MODEL),
    schema: commandsSchema,
    system: SYSTEM_PROMPT,
    prompt: buildUserMessage({ instruction, state, history }),
  });
  return object;
}

// Human-readable reason for the active mode, for startup logs / health.
export function mockReason() {
  if (!MOCK) return null;
  return process.env.PBJT_MOCK === '1' ? 'PBJT_MOCK=1' : 'no OPENAI_API_KEY set';
}
