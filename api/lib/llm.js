/**
 * Shared LLM fallback chain: Gemini → OpenAI → Azure OpenAI → Anthropic
 * Single source of truth — imported by analyse.js and intelligence.js
 *
 * Features:
 * - Automatic retry with exponential backoff on 429 (rate limit)
 * - Configurable max_tokens per call
 * - Anthropic Claude as final fallback
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from multiple locations (social-intel/.env takes priority, then parent .env.local)
dotenv.config({ path: join(__dirname, '..', '..', '.env') });
dotenv.config({ path: join(__dirname, '..', '..', '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '..', '..', '.env') });

// Reuse Gemini client across calls
let _geminiClient = null;
function getGeminiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (!_geminiClient) _geminiClient = new GoogleGenerativeAI(key);
  return _geminiClient;
}

/**
 * Sleep for ms
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call LLM with automatic fallback chain and retry on rate limits
 * @param {string} prompt
 * @param {string} [label='LLM'] - Log prefix for debugging
 * @param {object} [opts] - Options
 * @param {number} [opts.maxTokens=8192] - Max response tokens
 * @returns {Promise<string>} LLM response text
 */
export async function callLLM(prompt, label = 'LLM', opts = {}) {
  const maxTokens = opts.maxTokens || 8192;
  const errors = [];

  // 1. Gemini (with retry on 429)
  const gemini = getGeminiClient();
  if (gemini) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        console.log(`  [${label}] Trying Gemini${attempt > 0 ? ' (retry ' + attempt + ')' : ''}...`);
        const model = gemini.getGenerativeModel({
          model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
          generationConfig: { maxOutputTokens: maxTokens },
        });
        const result = await model.generateContent(prompt);
        console.log(`  [${label}] Gemini succeeded`);
        return result.response.text();
      } catch (err) {
        const is429 = err.message?.includes('429') || err.message?.includes('Too Many');
        if (is429 && attempt < 2) {
          const backoff = (attempt + 1) * 15000; // 15s, 30s
          console.log(`  [${label}] Gemini rate-limited, waiting ${backoff / 1000}s...`);
          await sleep(backoff);
          continue;
        }
        console.log(`  [${label}] Gemini failed: ${err.message}`);
        errors.push('Gemini: ' + err.message);
        break;
      }
    }
  }

  // 2. OpenAI
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(`  [${label}] Trying OpenAI${attempt > 0 ? ' (retry)' : ''}...`);
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.choices?.[0]?.message?.content || '';
          if (text) {
            console.log(`  [${label}] OpenAI succeeded`);
            return text;
          }
        }
        const body = await res.text().catch(() => '');
        const is429 = res.status === 429;
        if (is429 && attempt < 1) {
          console.log(`  [${label}] OpenAI rate-limited, waiting 10s...`);
          await sleep(10000);
          continue;
        }
        errors.push('OpenAI: HTTP ' + res.status + (body ? ' — ' + body.slice(0, 200) : ''));
        console.log(`  [${label}] OpenAI failed: HTTP ${res.status}`);
        break;
      } catch (err) {
        console.log(`  [${label}] OpenAI failed: ${err.message}`);
        errors.push('OpenAI: ' + err.message);
        break;
      }
    }
  }

  // 3. Azure OpenAI
  const azureKey = process.env.AZURE_OPENAI_API_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  if (azureKey && azureEndpoint) {
    try {
      console.log(`  [${label}] Trying Azure OpenAI...`);
      const res = await fetch(azureEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': azureKey,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content
          || data.output?.[0]?.content?.[0]?.text
          || '';
        if (text) {
          console.log(`  [${label}] Azure OpenAI succeeded`);
          return text;
        }
      }
      errors.push('Azure: HTTP ' + res.status);
      console.log(`  [${label}] Azure OpenAI failed: HTTP ${res.status}`);
    } catch (err) {
      console.log(`  [${label}] Azure OpenAI failed: ${err.message}`);
      errors.push('Azure: ' + err.message);
    }
  }

  // 4. Anthropic Claude (final fallback)
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      console.log(`  [${label}] Trying Anthropic Claude...`);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.content?.[0]?.text || '';
        if (text) {
          console.log(`  [${label}] Anthropic Claude succeeded`);
          return text;
        }
      }
      const body = await res.text().catch(() => '');
      errors.push('Anthropic: HTTP ' + res.status + (body ? ' — ' + body.slice(0, 200) : ''));
      console.log(`  [${label}] Anthropic failed: HTTP ${res.status}`);
    } catch (err) {
      console.log(`  [${label}] Anthropic failed: ${err.message}`);
      errors.push('Anthropic: ' + err.message);
    }
  }

  throw new Error(`All LLM providers failed: ${errors.join('; ') || 'No API keys configured (need GEMINI_API_KEY, OPENAI_API_KEY, AZURE_OPENAI_API_KEY, or ANTHROPIC_API_KEY)'}`);
}
