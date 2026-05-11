# Make.com LLM Fallback — Scenario Blueprint

Final tier in the fallback chain. If Gemini, Azure, Anthropic, DeepSeek AND Kimi all fail,
the code POSTs your prompt to this Make scenario, which uses Make's own pooled LLM credits
to generate a response and returns it as JSON.

**Benefit:** your app NEVER fails on an LLM call. Worst case is a slightly slower response
while Make.com's scenario runs.

---

## Step 1 — Create the scenario in Make

1. Log in to **make.com** → **Create new scenario**
2. Scenario name: `LLM Fallback — Social Intel`

### Module 1 — Webhooks > Custom webhook (trigger)
- **Webhook type:** Custom webhook
- **Name:** `social-intel-llm-fallback`
- Click **Add** → copy the URL it generates → this is your `MAKE_LLM_FALLBACK_URL`
- **Run once** to let Make detect the incoming payload shape. To do this:
  - Run the test script below (Step 4) and Make will auto-detect structure.

Expected incoming JSON (what your app sends):
```json
{
  "prompt": "long text prompt",
  "maxTokens": 8192,
  "label": "brand-report",
  "origin": "social-intel",
  "ts": "2026-04-18T08:00:00.000Z"
}
```

### Module 2 — Tools > Set variable (secret check)
- **Variable name:** `authorized`
- **Value:** `{{if(1.`__IMTHEADERS__`[map(1.`__IMTHEADERS__`; "name"; "name"; "x-make-secret")].value = "YOUR_SECRET_HERE"; true; false)}}`

Simpler alternative — use a **Filter** between modules 1 and 3:
- Condition: `X-Make-Secret` header equals `YOUR_SECRET_HERE`
- Whatever secret you choose, also put in `.env.local` as `MAKE_LLM_FALLBACK_SECRET`.

### Module 3 — OpenAI (or Anthropic) — Create a Completion
- **Connection:** create a new OpenAI connection using your Make-pooled key
  (Make sells OpenAI operations at a markup, or you can add your own API key here)
- **Model:** `gpt-4o-mini` (cheapest acceptable quality)
- **Messages:**
  ```
  Role: user
  Content: {{1.prompt}}
  ```
- **Max tokens:** `{{1.maxTokens}}`
- **Temperature:** `0.3`

> **Alternative:** Use the Anthropic module instead, with model `claude-3-5-haiku-20241022` for cost, or `claude-sonnet-4-20250514` for quality.

### Module 4 — Webhook response
- **Status:** `200`
- **Body type:** JSON
- **Body:**
  ```json
  {
    "text": "{{3.result}}",
    "provider": "make-openai",
    "label": "{{1.label}}"
  }
  ```
- **Custom headers:** `Content-Type: application/json`

### Module 5 (optional) — Error handler on Module 3
If the LLM module fails, fall through to a graceful webhook response so your app
still gets *something* rather than 500:
- **Right-click Module 3 → Add error handler → Router**
- On error, route to a **Webhook response** module:
  ```json
  {
    "text": "I encountered an issue generating this response. Please retry in a moment.",
    "provider": "make-graceful-fail"
  }
  ```
  Status 200.

This way your app NEVER errors.

---

## Step 2 — Activate + test

1. **Save + Enable** the scenario
2. Set **Scheduling** to "immediately as data arrives"
3. Add to your `.env.local`:
   ```
   MAKE_LLM_FALLBACK_URL=<the webhook URL from Module 1>
   MAKE_LLM_FALLBACK_SECRET=<any long random string you chose for Module 2>
   ```

Generate a random secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Step 3 — Restart the API server

```bash
cd C:\Users\nikki\Downloads\standalone\social-intel
# kill current, then:
node api/server.js
```

The `llm-v2.js` auto-detects `MAKE_LLM_FALLBACK_URL` and adds it to the chain.

---

## Step 4 — Self-test script

A CLI tester that forces the fallback to fire — run this to verify end-to-end:

```bash
node api/lib/make-fallback-test.js
```

This sends a real request to your webhook and prints whatever comes back.
Use it after any Make scenario change to confirm nothing broke.

---

## What the live log will look like after it's wired

Normal flow (Make never needed):
```
[brand-report] Trying anthropic...
[brand-report] ✓ anthropic succeeded (44s)
```

Disaster flow (everything else down):
```
[brand-report] Trying anthropic... ✗ 529 overloaded
[brand-report] Trying azure...     ✗ timeout
[brand-report] Trying gemini...    ✗ 429
[brand-report] Trying deepseek...  ⊘ not configured
[brand-report] Trying kimi...      ⊘ not configured
[brand-report] Trying make...
[brand-report] ✓ make succeeded (8s)
```

The app gets a response either way. You get paged nowhere.

---

## Cost

Make.com pricing: ~$0.005 per operation. Each fallback = 4 operations = ~$0.02/request.

If it fires even 100 times a month (extreme edge case), that's $2. Totally worth the insurance.
