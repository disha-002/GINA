/**
 * Temporary: verify HF access to SQLCoder (delete after use).
 *
 *   cd backend && node --import dotenv/config scripts/hf-sqlcoder-smoke.mjs
 *
 * Env: HF_API_KEY_1 (or HF_API_KEY), optional SQLCODER_HF_MODEL / MODEL.
 * Does not print your API key.
 */
import 'dotenv/config';
import { InferenceClient, setLogger } from '@huggingface/inference';

setLogger({
  ...console,
  log: () => {},
  debug: () => {},
});

const model =
  process.env.MODEL?.trim() ||
  process.env.SQLCODER_HF_MODEL?.trim() ||
  'defog/llama-3-sqlcoder-8b';
const key =
  process.env.HF_API_KEY?.trim() ||
  process.env.HF_API_KEY_1?.trim() ||
  '';

if (!key) {
  console.error('Missing API key: set HF_API_KEY_1 in .env or HF_API_KEY for this run.');
  process.exit(1);
}

const miniPrompt = `### Task
Generate a PostgreSQL SELECT that returns one row: SELECT 1 AS x;

### SQL`;

async function hubInferenceMapping() {
  // Path must be /api/models/defog/llama-3-sqlcoder-8b — do not encode the org/model slash as %2F.
  const url = `https://huggingface.co/api/models/${model}?expand[]=inferenceProviderMapping`;
  const res = await fetch(url, {
    headers: key.startsWith('hf_') ? { Authorization: `Bearer ${key}` } : {},
  });
  const text = await res.text();
  if (!res.ok) {
    console.log(`[Hub model API] HTTP ${res.status} — token may be invalid or model id wrong.`);
    console.log(text.slice(0, 400));
    return null;
  }
  try {
    const j = JSON.parse(text);
    const m = j.inferenceProviderMapping;
    console.log('[Hub model API] OK — inferenceProviderMapping:');
    console.log(JSON.stringify(m, null, 2)?.slice(0, 2000) ?? '(none)');
    return j;
  } catch {
    console.log('[Hub model API] parse error', text.slice(0, 300));
    return null;
  }
}

async function main() {
  console.log(`Model: ${model}\n`);

  await hubInferenceMapping();
  console.log('\n--- Inference calls (same order as app: textGeneration, then chatCompletion) ---\n');

  const client = new InferenceClient(key);

  try {
    const out = await client.textGeneration(
      {
        model,
        inputs: miniPrompt,
        parameters: { max_new_tokens: 128 },
        provider: 'hf-inference',
      },
      { retry_on_error: false },
    );
    console.log('[textGeneration + hf-inference] OK');
    console.log(String(out?.generated_text ?? out).slice(0, 600));
    console.log('\n=> Your key can run this model via hf-inference. You are good.');
    return;
  } catch (e) {
    console.error('[textGeneration + hf-inference] FAILED:', e?.message ?? e);
  }

  try {
    const out = await client.textGeneration(
      {
        model,
        inputs: miniPrompt,
        parameters: { max_new_tokens: 128 },
      },
      { retry_on_error: false },
    );
    console.log('[textGeneration + auto provider] OK');
    console.log(String(out?.generated_text ?? out).slice(0, 600));
    console.log('\n=> Works via Hub auto-routing. Check provider billing / settings on hf.co.');
    return;
  } catch (e) {
    console.error('[textGeneration + auto] FAILED:', e?.message ?? e);
  }

  // Hub often maps SQLCoder-class models to "conversational" only (e.g. Featherless), not text-generation.
  try {
    const out = await client.chatCompletion(
      {
        model,
        messages: [{ role: 'user', content: miniPrompt }],
        max_tokens: 256,
        temperature: 0,
        provider: 'featherless-ai',
      },
      { retry_on_error: false },
    );
    const text = out?.choices?.[0]?.message?.content ?? '';
    console.log('[chatCompletion + featherless-ai] OK');
    console.log(String(text).slice(0, 600));
    console.log('\n=> Matches backend tierHf (chatCompletion fallback). You are good.');
    process.exit(0);
  } catch (e) {
    console.error('[chatCompletion + featherless-ai] FAILED:', e?.message ?? e);
    if (e?.httpResponse) {
      console.error('  HTTP status:', e.httpResponse.status, 'body:', e.httpResponse.body);
    }
  }

  try {
    const out = await client.chatCompletion(
      {
        model,
        messages: [{ role: 'user', content: miniPrompt }],
        max_tokens: 256,
        temperature: 0,
      },
      { retry_on_error: false },
    );
    const text = out?.choices?.[0]?.message?.content ?? '';
    console.log('[chatCompletion + auto] OK');
    console.log(String(text).slice(0, 600));
    console.log('\n=> Works via Hub auto-routing for conversational.');
    process.exit(0);
  } catch (e) {
    console.error('[chatCompletion + auto] FAILED:', e?.message ?? e);
    if (e?.httpResponse) {
      console.error('  HTTP status:', e.httpResponse.status, 'body:', e.httpResponse.body);
    }
  }

  console.log(
    '\n=> text-generation and chat-completion both failed. Check token scopes, model gate access, and Inference Providers on hf.co.',
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
