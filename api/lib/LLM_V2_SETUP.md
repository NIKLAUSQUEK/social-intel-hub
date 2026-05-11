# LLM v2 — Fix for content-intel + hooklab failures

## What was broken

Your existing `api/lib/llm.js` had a 4-tier fallback chain (Gemini → OpenAI → Azure → Anthropic), but 2 of the 4 tiers didn't work in practice:

1. **OpenAI tier**: `OPENAI_API_KEY` in `.env.local` is actually your Azure key (identical value). Calling `api.openai.com` with an Azure key returns **401 Unauthorized**.
2. **Azure tier**: Sent Chat Completions body shape `{messages, max_tokens}`, but your `AZURE_OPENAI_ENDPOINT` is the newer **Responses API** which needs `{input, instructions, max_output_tokens}`. Returns **400 Bad Request**.

So when Gemini hit its free-tier 429, the chain fell through to the only real fallback (Anthropic). If Anthropic also had any issue (env not loaded, key revoked), everything failed.

## What v2 does

- Removes broken direct-OpenAI tier
- Fixes Azure to use Responses API shape
- Adds DeepSeek + Kimi tiers (activate by setting their env keys)
- Adds **Make.com webhook** as the absolute final fallback — so the app never fails even if all 5 LLM providers are down

## Wiring — 2 lines to change yourself

Per the safety constraint I'm operating under, I won't edit your existing route files. Swap the import in both places:

**`api/routes/analyse.js`** — change the line that imports `callLLM`:
```js
// before
import { callLLM } from '../lib/llm.js';
// after
import { callLLM } from '../lib/llm-v2.js';
```

**`api/routes/intelligence.js`** — same change:
```js
// before
import { callLLM } from '../lib/llm.js';
// after
import { callLLM } from '../lib/llm-v2.js';
```

Same function signature (`callLLM(prompt, label, opts)`), zero other changes needed.

Then restart the server:
```
node api/server.js
```

## New fallback chain

```
1. Gemini 2.0 Flash      ← free, tries 3× with 2s/4s/8s backoff
2. Azure GPT-5.4-mini    ← paid, reliable, Responses API fixed
3. Anthropic Claude Haiku ← paid, reliable
4. DeepSeek v3           ← cheap, activate by setting DEEPSEEK_API_KEY
5. Kimi (Moonshot)       ← cheap, activate by setting KIMI_API_KEY
6. Make.com webhook      ← ultimate fallback, see setup below
```

## Make.com webhook setup (optional, but recommended for "no failures")

### Step 1 — Add env vars

```
MAKE_LLM_FALLBACK_URL=https://hook.eu1.make.com/xxxxx
MAKE_LLM_FALLBACK_SECRET=<any long random string>
```

### Step 2 — Build the Make.com scenario

**Module 1 — Custom Webhook (trigger)**
- Data structure: auto-detect from first run
- Expected body:
  ```json
  {
    "prompt": "string",
    "maxTokens": 8192,
    "label": "HookLab",
    "origin": "social-intel",
    "ts": "ISO timestamp"
  }
  ```

**Module 2 — Filter** (reject unsigned requests)
- Condition: `{{1.headers.`x-make-secret`}} equals the secret you set

**Module 3 — OpenAI (Make.com's built-in module) OR any LLM module**
- This uses Make's pooled credits so it avoids hitting your API keys
- Model: `gpt-4o-mini` or whatever you prefer
- Messages: `[{role: "user", content: {{1.prompt}}}]`
- Max tokens: `{{1.maxTokens}}`

**Module 4 — Webhook Response**
- Status: 200
- Body (JSON):
  ```json
  {
    "text": "{{3.result}}",
    "provider": "make-openai"
  }
  ```

**Error handler on Module 3:**
- Route to a second LLM module (Anthropic or Mistral module in Make)
- Or route to a Telegram notification that a fallback exhausted — but STILL respond 200 with a graceful error message so your app doesn't crash:
  ```json
  {
    "text": "I couldn't generate a response right now. Please try again in a minute.",
    "provider": "make-graceful-fail"
  }
  ```

### Step 3 — Test

With the v2 module installed and Make.com wired, even if you deliberately set every LLM key to an invalid value, your content-intel and hooklab endpoints should still return a response (not error) — it just goes through Make.com's LLM pool.

## Quick test without Make.com

After swapping the imports and restarting, hit any content-intel endpoint. Expected log:

```
[HookLab] Trying gemini...
[HookLab] ✗ gemini: Gemini 429: ... (rate limited)
[HookLab] Trying azure...
[HookLab] ✓ azure succeeded (1840ms)
```

If you see this, the fix is working and you can add Make.com whenever you want additional resilience.

## Rollback

If v2 misbehaves, just revert the import lines to `./llm.js`. The original file is untouched.
