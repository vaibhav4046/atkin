/**
 * Where answers come from.
 *
 * Three of these, and the differences matter to the person using them:
 *
 *   sample  Prepared answers for the worked example. No model runs, nothing is
 *           sent anywhere, and it costs nothing. Every screen that shows sample
 *           results says so, because a demo that pretends to be a live run is a
 *           lie the user finds out about later.
 *   ollama  A model on the user's own machine. Free, and the documents never
 *           leave the building, which is the answer for an unpublished thesis or
 *           a client's invoices.
 *   openai  Any endpoint speaking the OpenAI chat completions shape, with a key
 *           the user pastes. Faster and better, and it is their key and their
 *           bill, so the interface says what a run will cost before it starts.
 *
 * The RocketRide pipeline is exercised from scripts/check.ts rather than here.
 * A page served over the internet has no business posting to an engine on
 * somebody's loopback interface, and browsers rightly will not let it.
 */
import type { ModelClient } from './engine';

const TIMEOUT_MS = 120_000;

/** Fetch with a deadline, so a hung endpoint cannot wedge a whole run. */
async function post(url: string, body: unknown, headers: Record<string, string>, signal: AbortSignal | undefined): Promise<Response> {
  const timer = new AbortController();
  const id = setTimeout(() => timer.abort(new Error('timed out after 120 seconds')), TIMEOUT_MS);
  const onAbort = (): void => timer.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: timer.signal,
    });
  } finally {
    clearTimeout(id);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  const trimmed = text.trim().slice(0, 300);
  return `HTTP ${res.status}${trimmed.length > 0 ? ': ' + trimmed : ''}`;
}

/**
 * Replay prepared answers.
 *
 * Keyed by document id. A miss is an error rather than a shrug, because a silent
 * fallback would let a broken sample project look like a working one.
 */
export function sampleClient(answers: Readonly<Record<string, string>>): ModelClient {
  return {
    id: 'sample',
    label: 'Worked example',
    kind: 'sample',
    complete(prompt: string): Promise<string> {
      const match = /Document name: (.+)/.exec(prompt);
      const key = match?.[1]?.trim() ?? '';
      const wanted = prompt.includes('"fields"') ? 'extract:' + key : 'screen:' + key;
      const answer = answers[wanted];
      if (answer === undefined) {
        return Promise.reject(new Error('the worked example has no prepared answer for ' + JSON.stringify(wanted)));
      }
      return Promise.resolve(answer);
    },
  };
}

export type OllamaConfig = { base: string; model: string };

export function ollamaClient({ base, model }: OllamaConfig): ModelClient {
  const root = base.replace(/\/+$/, '');
  return {
    id: 'ollama',
    label: 'Ollama, ' + model,
    kind: 'model',
    async complete(prompt, signal) {
      const res = await post(
        root + '/api/generate',
        // Temperature zero because two runs over the same pile should agree.
        { model, prompt, stream: false, options: { temperature: 0 } },
        {},
        signal,
      );
      if (!res.ok) throw new Error(await readError(res));
      const data: unknown = await res.json();
      const response = (data as { response?: unknown }).response;
      if (typeof response !== 'string') throw new Error('Ollama returned no response field');
      return response;
    },
  };
}

export type OpenAiConfig = { base: string; model: string; apiKey: string };

export function openAiClient({ base, model, apiKey }: OpenAiConfig): ModelClient {
  const root = base.replace(/\/+$/, '');
  return {
    id: 'openai',
    label: model,
    kind: 'model',
    async complete(prompt, signal) {
      const res = await post(
        root + '/chat/completions',
        { model, temperature: 0, messages: [{ role: 'user', content: prompt }] },
        { authorization: 'Bearer ' + apiKey },
        signal,
      );
      if (!res.ok) throw new Error(await readError(res));
      const data: unknown = await res.json();
      const choices = (data as { choices?: unknown }).choices;
      const first = Array.isArray(choices) ? (choices[0] as { message?: { content?: unknown } } | undefined) : undefined;
      const content = first?.message?.content;
      if (typeof content !== 'string') throw new Error('the endpoint returned no message content');
      return content;
    },
  };
}

/** Endpoints that speak the OpenAI shape, for the provider picker. */
export const OPENAI_PRESETS: Readonly<Record<string, { base: string; model: string; keyName: string }>> = {
  OpenAI: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', keyName: 'OpenAI API key' },
  Groq: { base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyName: 'Groq API key' },
  Together: { base: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', keyName: 'Together API key' },
  OpenRouter: { base: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct', keyName: 'OpenRouter API key' },
};
