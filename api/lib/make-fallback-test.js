#!/usr/bin/env node
/**
 * Make.com LLM fallback self-test.
 *
 * Usage:
 *   node api/lib/make-fallback-test.js
 *
 * Posts a simple test prompt directly to MAKE_LLM_FALLBACK_URL, bypassing the
 * other LLM providers. Prints the raw response + timing so you can verify the
 * scenario works before relying on it in production.
 *
 * Requires in .env.local:
 *   MAKE_LLM_FALLBACK_URL
 *   MAKE_LLM_FALLBACK_SECRET (optional — only needed if your scenario checks it)
 */

import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '..', '.env.local'), override: true });

const url = process.env.MAKE_LLM_FALLBACK_URL;
const secret = process.env.MAKE_LLM_FALLBACK_SECRET || '';

if (!url) {
  console.error('✗ MAKE_LLM_FALLBACK_URL not set in .env.local');
  console.error('  See api/lib/MAKE_LLM_FALLBACK.md for setup.');
  process.exit(1);
}

const testPayload = {
  prompt: 'Say "Make.com fallback is operational" and nothing else.',
  maxTokens: 50,
  label: 'make-selftest',
  origin: 'social-intel',
  ts: new Date().toISOString(),
};

console.log('═══════════════════════════════════════════');
console.log('  Make.com LLM Fallback — Self-test');
console.log('═══════════════════════════════════════════');
console.log(`  URL:       ${url.slice(0, 60)}…`);
console.log(`  Secret:    ${secret ? 'SET (' + secret.length + ' chars)' : '(none — ok if scenario allows)'}`);
console.log(`  Prompt:    "${testPayload.prompt}"`);
console.log('───────────────────────────────────────────');

const start = Date.now();
try {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Make-Secret': secret,
    },
    body: JSON.stringify(testPayload),
    signal: AbortSignal.timeout(120_000),
  });

  const elapsed = Date.now() - start;
  const bodyText = await res.text();
  console.log(`  HTTP ${res.status} (${elapsed}ms)`);
  console.log('  Body (first 500 chars):');
  console.log('  ' + bodyText.slice(0, 500).split('\n').join('\n  '));
  console.log('───────────────────────────────────────────');

  if (!res.ok) {
    console.error('✗ FAIL — non-2xx response');
    console.error('  Check your Make scenario is enabled + webhook URL is correct.');
    process.exit(2);
  }

  try {
    const json = JSON.parse(bodyText);
    if (!json.text) {
      console.error('✗ WARN — response has no "text" field');
      console.error('  Expected shape: { text: "...", provider: "..." }');
      console.error('  Your Module 4 (Webhook response) needs a "text" field in the JSON body.');
      process.exit(3);
    }
    console.log('✓ PASS — got text response from Make.com');
    console.log(`  Provider: ${json.provider || '(not set)'}`);
    console.log(`  Text:     "${json.text.slice(0, 120)}"`);
    console.log('');
    console.log('  Your llm-v2 fallback is operational.');
  } catch (e) {
    console.error('✗ WARN — response is not valid JSON');
    console.error('  Make sure Module 4 has "Body type: JSON"');
    process.exit(4);
  }
} catch (err) {
  console.error(`✗ FAIL — request error: ${err.message}`);
  console.error('  Common causes: webhook URL typo, scenario not enabled, Make region wrong.');
  process.exit(5);
}
