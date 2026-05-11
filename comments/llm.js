/**
 * LLM classifier with fallback chain: Gemini Flash → DeepSeek → Kimi
 *
 * All three expose OpenAI-compatible chat endpoints (except Gemini which
 * has its own REST shape). Fallback triggers on 429 / 5xx / timeout.
 *
 * Pricing (per 1M tokens, April 2026):
 *   Gemini 2.0 Flash:  $0.075 input / $0.30 output
 *   DeepSeek v3:       $0.07 input  / $1.10 output
 *   Kimi k2:           $0.60 input  / $2.50 output
 *
 * Env vars:
 *   GEMINI_API_KEY        required for primary
 *   DEEPSEEK_API_KEY      optional fallback 1
 *   KIMI_API_KEY          optional fallback 2 (Moonshot)
 */

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const KIMI_URL = 'https://api.moonshot.ai/v1/chat/completions';
// Azure OpenAI Responses API — endpoint is the full URL from .env.local
// e.g. https://W9187-....services.ai.azure.com/api/projects/.../openai/v1/responses

function timeoutSignal(ms) {
  return AbortSignal.timeout(ms);
}

// ── Gemini ─────────────────────────────────────────

async function callGemini({ system, user, jsonSchema, maxTokens = 400 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: maxTokens,
      responseMimeType: jsonSchema ? 'application/json' : 'text/plain',
      ...(jsonSchema ? { responseSchema: jsonSchema } : {}),
    },
  };

  const res = await fetch(`${GEMINI_URL}/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: timeoutSignal(20_000),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini empty response');

  // Usage for cost tracking
  const usage = {
    inputTokens: json.usageMetadata?.promptTokenCount || 0,
    outputTokens: json.usageMetadata?.candidatesTokenCount || 0,
    provider: 'gemini',
  };
  return { text, usage };
}

// ── DeepSeek (OpenAI-compatible) ───────────────────

async function callDeepSeek({ system, user, maxTokens = 400 }) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not set');

  const body = {
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  };

  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    signal: timeoutSignal(25_000),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}`);

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('DeepSeek empty');

  return {
    text,
    usage: {
      inputTokens: json.usage?.prompt_tokens || 0,
      outputTokens: json.usage?.completion_tokens || 0,
      provider: 'deepseek',
    },
  };
}

// ── Azure OpenAI (Responses API) ───────────────────

async function callAzure({ system, user, maxTokens = 400 }) {
  const key = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  if (!key || !endpoint) throw new Error('AZURE_OPENAI_API_KEY / ENDPOINT not set');

  // Azure Responses API requires the input to mention "json" when using text.format=json_object
  const jsonHint = /json/i.test(user) ? '' : '\n\nReturn the result as valid JSON.';
  const body = {
    model: process.env.AZURE_OPENAI_MODEL || 'gpt-5.4-mini',
    instructions: system,
    input: user + jsonHint,
    max_output_tokens: maxTokens,
    temperature: 0.2,
    text: { format: { type: 'json_object' } },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': key,
    },
    body: JSON.stringify(body),
    signal: timeoutSignal(25_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Azure ${res.status}: ${err.slice(0, 120)}`);
  }

  const json = await res.json();
  // Responses API output shape — handle both output_text and output[].content[]
  let text = json.output_text;
  if (!text && Array.isArray(json.output)) {
    for (const item of json.output) {
      for (const c of item.content || []) {
        if (c.type === 'output_text' || c.type === 'text') text = (text || '') + (c.text || '');
      }
    }
  }
  if (!text) throw new Error('Azure empty response');

  return {
    text,
    usage: {
      inputTokens: json.usage?.input_tokens || 0,
      outputTokens: json.usage?.output_tokens || 0,
      provider: 'azure',
    },
  };
}

// ── Anthropic Claude (for premium-tier cluster summarisation) ───────

async function callAnthropic({ system, user, maxTokens = 400, model }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');

  // Claude requires JSON mention in the user prompt for consistent JSON mode
  const jsonHint = /json/i.test(user) ? '' : '\n\nReturn the result as valid JSON only, no prose.';

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || process.env.COMMENTS_ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user + jsonHint }],
    }),
    signal: timeoutSignal(60_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 140)}`);
  }
  const json = await res.json();
  const text = json.content?.[0]?.text;
  if (!text) throw new Error('Anthropic empty response');

  return {
    text,
    usage: {
      inputTokens: json.usage?.input_tokens || 0,
      outputTokens: json.usage?.output_tokens || 0,
      provider: 'anthropic',
    },
  };
}

// ── Kimi (Moonshot, OpenAI-compatible) ─────────────

async function callKimi({ system, user, maxTokens = 400 }) {
  const key = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  if (!key) throw new Error('KIMI_API_KEY not set');

  const body = {
    model: process.env.KIMI_MODEL || 'moonshot-v1-8k',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  };

  const res = await fetch(KIMI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    signal: timeoutSignal(25_000),
  });
  if (!res.ok) throw new Error(`Kimi ${res.status}`);

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('Kimi empty');

  return {
    text,
    usage: {
      inputTokens: json.usage?.prompt_tokens || 0,
      outputTokens: json.usage?.completion_tokens || 0,
      provider: 'kimi',
    },
  };
}

// ── Cost calc ──────────────────────────────────────

const PRICING = {
  gemini:    { in: 0.075 / 1_000_000, out: 0.30 / 1_000_000 },
  azure:     { in: 0.15  / 1_000_000, out: 0.60 / 1_000_000 },   // gpt-5.4-mini approx
  anthropic: { in: 3.00  / 1_000_000, out: 15.00 / 1_000_000 },  // Sonnet 4 pricing
  deepseek:  { in: 0.07  / 1_000_000, out: 1.10 / 1_000_000 },
  kimi:      { in: 0.60  / 1_000_000, out: 2.50 / 1_000_000 },
};

export function costFromUsage(usage) {
  const p = PRICING[usage.provider] || PRICING.gemini;
  return usage.inputTokens * p.in + usage.outputTokens * p.out;
}

// ── Public: classify with fallback ─────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function withRetry(fn, opts, { attempts = 3, baseMs = 2000 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(opts);
    } catch (err) {
      lastErr = err;
      // Only retry on rate limits / transient 5xx
      const msg = err.message || '';
      const retryable = /429|5\d\d|timeout|ETIMEDOUT|ECONNRESET/i.test(msg);
      if (!retryable || i === attempts - 1) throw err;
      const delay = baseMs * Math.pow(2, i);
      console.log(`  [LLM retry ${i + 1}/${attempts}] ${msg.slice(0, 80)} — waiting ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

export async function classifyWithFallback(opts) {
  // Tier-aware routing:
  //   tier:'premium' → Anthropic Sonnet 4 first (for cluster summaries / content ideas)
  //   tier:'standard' (default) → Gemini → Azure → Anthropic → DeepSeek → Kimi (for bulk per-comment classification)
  const isPremium = opts.tier === 'premium';

  const gemini    = { name: 'gemini',    fn: callGemini,    available: () => !!process.env.GEMINI_API_KEY };
  const azure     = { name: 'azure',     fn: callAzure,     available: () => !!(process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT) };
  const anthropic = { name: 'anthropic', fn: callAnthropic, available: () => !!process.env.ANTHROPIC_API_KEY };
  const deepseek  = { name: 'deepseek',  fn: callDeepSeek,  available: () => !!process.env.DEEPSEEK_API_KEY };
  const kimi      = { name: 'kimi',      fn: callKimi,      available: () => !!(process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY) };

  const providers = isPremium
    ? [anthropic, azure, gemini, deepseek, kimi]
    : [gemini, azure, anthropic, deepseek, kimi];

  let lastErr;
  for (const { name, fn, available } of providers) {
    if (!available()) continue; // skip unconfigured — don't waste time
    try {
      return await withRetry(fn, opts);
    } catch (err) {
      lastErr = err;
      console.log(`  [LLM ${name}] failed after retries: ${err.message} — trying next provider`);
    }
  }
  throw new Error(`All LLM providers failed: ${lastErr?.message || 'no providers configured'}`);
}
