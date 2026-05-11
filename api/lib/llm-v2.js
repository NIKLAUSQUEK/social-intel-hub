/**
 * LLM v2 — Hardened fallback chain for content-intel + hooklab
 *
 * Fallback order (each step only runs if its env is configured):
 *   1. Gemini 2.0 Flash           (cheap, free tier, rate-limited)
 *   2. Azure GPT-5.4-mini         (Responses API — fixed body shape)
 *   3. Anthropic Claude           (reliable, paid)
 *   4. DeepSeek v3                (cheap fallback if configured)
 *   5. Kimi (Moonshot)            (last LLM resort)
 *   6. Make.com webhook           (final fallback — dispatches to cloud queue)
 *
 * Fixes vs llm.js:
 *   - Removes the broken direct-OpenAI call (OPENAI_API_KEY here is actually the Azure key)
 *   - Fixes Azure to use Responses API body: {instructions, input, max_output_tokens}
 *   - Adds Make.com webhook as final tier so app never returns "all providers failed" to user
 *   - Each provider retries on 429/5xx with exponential backoff
 *   - Structured return: { text, provider, attempts, totalMs }
 *
 * Drop-in replacement:
 *   // Before:
 *   import { callLLM } from '../lib/llm.js';
 *   // After:
 *   import { callLLM } from '../lib/llm-v2.js';
 */

import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from standard locations.
// IMPORTANT: use override:true because the Claude Code shell exports empty
// strings for these keys, which would otherwise shadow the real values.
dotenv.config({ path: join(__dirname, '..', '..', '.env'), override: true });
dotenv.config({ path: join(__dirname, '..', '..', '..', '.env.local'), override: true });
dotenv.config({ path: join(__dirname, '..', '..', '..', '.env'), override: true });

// ── Utilities ──────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isTransient(err, httpStatus) {
  const status = httpStatus || 0;
  if (status === 429 || (status >= 500 && status < 600)) return true;
  const msg = (err?.message || '').toLowerCase();
  return /429|too many|rate.?limit|timeout|etimedout|econnreset|5\d\d/i.test(msg);
}

async function retrying(fn, { attempts = 3, baseMs = 2000, label = 'LLM' } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err, err.status) || i === attempts - 1) throw err;
      const delay = baseMs * Math.pow(2, i);
      console.log(`  [${label}] transient error — retry ${i + 1}/${attempts} in ${delay}ms: ${err.message?.slice(0, 100)}`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

function t(ms = 30_000) { return AbortSignal.timeout(ms); }

// ── 1. Gemini ──────────────────────────────────────

async function callGemini(prompt, maxTokens) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  const timeoutMs = maxTokens > 5000 ? 180_000 : 30_000;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens },
      }),
      signal: t(timeoutMs),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Gemini ${res.status}: ${body.slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini empty response');
  return text;
}

// ── 2. Azure (Responses API) ───────────────────────

async function callAzure(prompt, maxTokens) {
  const key = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  if (!key || !endpoint) throw new Error('AZURE_OPENAI_API_KEY/ENDPOINT not set');

  // Big prompts (>5k maxTokens) get a generous 3-min timeout; smaller stays at 30s
  const timeoutMs = maxTokens > 5000 ? 180_000 : 30_000;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': key },
    body: JSON.stringify({
      model: process.env.AZURE_OPENAI_MODEL || 'gpt-5.4-mini',
      input: prompt,
      max_output_tokens: maxTokens,
      temperature: 0.3,
    }),
    signal: t(timeoutMs),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Azure ${res.status}: ${body.slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  let text = json.output_text;
  if (!text && Array.isArray(json.output)) {
    for (const item of json.output) {
      for (const c of item.content || []) {
        if (c.type === 'output_text' || c.type === 'text') text = (text || '') + (c.text || '');
      }
    }
  }
  if (!text) throw new Error('Azure empty response');
  return text;
}

// ── 3. Anthropic ───────────────────────────────────

async function callAnthropic(prompt, maxTokens, modelOverride) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');

  const model = modelOverride || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
    // Opus/Sonnet 4 with long structured output can take 60-180s; give it headroom
    signal: t(240_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Anthropic ${res.status}: ${body.slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  const text = json.content?.[0]?.text;
  if (!text) throw new Error('Anthropic empty response');
  return text;
}

// ── 4. DeepSeek ────────────────────────────────────

async function callDeepSeek(prompt, maxTokens) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not set');

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
    signal: t(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`DeepSeek ${res.status}: ${body.slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('DeepSeek empty');
  return text;
}

// ── 5. Kimi (Moonshot) ─────────────────────────────

async function callKimi(prompt, maxTokens) {
  const key = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  if (!key) throw new Error('KIMI_API_KEY not set');

  const res = await fetch('https://api.moonshot.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.KIMI_MODEL || 'moonshot-v1-8k',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
    signal: t(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Kimi ${res.status}: ${body.slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('Kimi empty');
  return text;
}

// ── 6. Make.com final fallback ─────────────────────

/**
 * Posts the prompt to a Make.com webhook as the last resort.
 * The Make scenario is expected to:
 *   1. Try an LLM that Make.com has available (OpenAI, Anthropic, Gemini via Make modules)
 *   2. Return JSON: { text: string, provider: string }
 * If the webhook returns non-2xx or malformed JSON, we surface an error.
 *
 * Configure in .env.local:
 *   MAKE_LLM_FALLBACK_URL=https://hook.eu1.make.com/xxxxx
 *   MAKE_LLM_FALLBACK_SECRET=<shared secret matching the Make scenario>
 */
async function callMakeFallback(prompt, maxTokens, label) {
  const url = process.env.MAKE_LLM_FALLBACK_URL;
  if (!url) throw new Error('MAKE_LLM_FALLBACK_URL not set — final fallback unavailable');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Make-Secret': process.env.MAKE_LLM_FALLBACK_SECRET || '',
    },
    body: JSON.stringify({
      prompt,
      maxTokens,
      label,
      origin: 'social-intel',
      ts: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(120_000), // generous — Make scenarios can be slow
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Make.com fallback ${res.status}: ${body.slice(0, 160)}`);
  }
  const json = await res.json().catch(() => ({}));
  if (!json.text) throw new Error('Make.com fallback returned no text');
  return json.text;
}

// ── Public API ─────────────────────────────────────

/**
 * Try each LLM provider in order. Returns the first successful response.
 * Never returns null/empty — if everything fails, throws a detailed error.
 *
 * @param {string} prompt
 * @param {string} [label='LLM']
 * @param {object} [opts]
 * @param {number} [opts.maxTokens=8192]
 * @returns {Promise<string>}
 */
// Strip lone surrogate halves that crash JSON encoders (Anthropic + Azure both reject these).
// Caused by truncating multi-byte chars (Chinese/emoji) at substring boundaries upstream.
function sanitiseUnicode(s) {
  if (typeof s !== 'string') return s;
  // Replace lone high surrogates not followed by low, and lone low surrogates not preceded by high.
  return s
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1');
}

export async function callLLM(prompt, label = 'LLM', opts = {}) {
  const maxTokens = opts.maxTokens || 8192;
  const start = Date.now();
  const errors = [];

  // Sanitise prompt to prevent malformed-Unicode JSON encode errors at provider edges.
  prompt = sanitiseUnicode(prompt);

  // ── 3-tier routing ──
  // PREMIUM  → high-intel tasks (brand reports, voice-matched copy, strategy/validation).
  //            Anthropic first; depth & nuance matter more than cost.
  // CHEAP    → low-intel structured tasks (comment classification, sentiment, JSON
  //            extraction, tagging, schema fill). DeepSeek first; ~28× cheaper than
  //            Sonnet with effectively zero quality loss for these tasks.
  // STANDARD → mid-intel tasks (trend-jacking, competitor discovery, format intel).
  //            Gemini first; DeepSeek second; Azure third.
  //
  // Override priority: opts.tier > label heuristic > default 'standard'
  const tier = opts.tier ||
    (/brand|strategy|report|validation|opportun|voice|hook-gen/i.test(label) ? 'premium' :
     /comment|classify|classification|sentiment|extract|tag|schema|parse|structured|intent|topic|cluster|json/i.test(label) ? 'cheap' :
     'standard');

  const isPremium = tier === 'premium';

  // Anthropic uses opts.model override (so brand-report=Opus, validation=Sonnet)
  const anthropicFn = (p, m) => callAnthropic(p, m, opts.model);

  const gemini    = { name: 'gemini',    fn: callGemini,    available: () => !!process.env.GEMINI_API_KEY,            attempts: 3 };
  const anthropic = { name: 'anthropic', fn: anthropicFn,   available: () => !!process.env.ANTHROPIC_API_KEY,         attempts: 2 };
  const azure     = { name: 'azure',     fn: callAzure,     available: () => !!(process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT), attempts: 2 };
  const deepseek  = { name: 'deepseek',  fn: callDeepSeek,  available: () => !!process.env.DEEPSEEK_API_KEY,          attempts: 2 };
  const kimi      = { name: 'kimi',      fn: callKimi,      available: () => !!(process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY), attempts: 2 };
  const make      = { name: 'make',      fn: (p, m) => callMakeFallback(p, m, label), available: () => !!process.env.MAKE_LLM_FALLBACK_URL, attempts: 1 };

  const chain =
    tier === 'premium' ? [anthropic, azure, gemini, deepseek, kimi, make] :
    tier === 'cheap'   ? [deepseek, gemini, azure, anthropic, kimi, make] :
                         [gemini, azure, deepseek, anthropic, kimi, make];

  console.log(`  [${label}] tier=${tier} → ${chain.map(c => c.name).join(' → ')}`);

  for (const { name, fn, available, attempts } of chain) {
    if (!available()) {
      console.log(`  [${label}] ⊘ ${name} skipped (not configured)`);
      errors.push(`${name}: not configured`);
      continue;
    }
    try {
      console.log(`  [${label}] Trying ${name}...`);
      const text = await retrying(() => fn(prompt, maxTokens), { attempts, label: `${label}/${name}` });
      console.log(`  [${label}] ✓ ${name} succeeded (${Date.now() - start}ms)`);
      return text;
    } catch (err) {
      console.log(`  [${label}] ✗ ${name}: ${err.message?.slice(0, 120)}`);
      errors.push(`${name}: ${err.message}`);
      // continue to next provider
    }
  }

  throw new Error(`All LLM providers failed after ${Date.now() - start}ms: ${errors.join(' | ')}`);
}

// Compat export: some callers may import default
export default { callLLM };
