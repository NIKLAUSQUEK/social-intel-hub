# ElevenLabs Agent Setup — Step-by-Step

This is the config you paste into the ElevenLabs Conversational AI dashboard.
Takes about 10 minutes once your server is reachable from the public internet.

---

## Before you start

1. Server must be reachable from `api.elevenlabs.io`. Options:
   - **Local dev:** run `ngrok http 3099` and copy the HTTPS URL
   - **Prod:** deploy social-intel to a server with a public URL
2. Have `VOICE_WEBHOOK_SECRET` ready (any long random string).
3. ElevenLabs account with Conversational AI enabled.

Let `$BASE` = your public base URL, e.g. `https://abc123.ngrok-free.app`

---

## Step 1 — Create agent in ElevenLabs dashboard

1. Go to https://elevenlabs.io/app/conversational-ai
2. Click **Create Agent**
3. Name: `Social Intel — Internal`
4. Template: **Blank**

---

## Step 2 — Voice + language

- **Voice:** pick a cheap off-the-shelf voice. Recommended: **Bill** or **Sarah** (both on Turbo v2.5, lowest cost tier)
- **Language:** English (en-GB) — matches the project British English rule
- **Stability:** 0.45 (balanced)
- **Similarity:** 0.75
- **TTS model:** `eleven_turbo_v2_5` — 50% of standard cost, <400ms latency

---

## Step 3 — LLM config

- **Model:** `gpt-4o-mini` (cheapest good model) OR `gemini-2.0-flash` if available in your plan
- **Temperature:** 0.3 (factual, not creative)
- **Max tokens:** 150 (forces short spoken replies)

---

## Step 4 — System prompt

Paste exactly:

```
You are the Social Intel voice assistant for TITAN.AI. You report social media metrics for the user's 35 clients.

STYLE:
- British English. Concise, factual, conversational.
- Never exceed 2 sentences unless asked.
- Numbers: round to 1 decimal. Say "12.3k" not "twelve thousand three hundred".
- No preamble. No "sure", no "great question". Just the answer.

BEHAVIOUR:
- On ambiguous client names, call get_client_snapshot once and let the fuzzy match decide.
- Use tool results verbatim — they're already formatted for speech.
- If a tool returns found: false, ask the user to repeat the name.
- If asked something outside scope (weather, news, opinions), say "That's not something I track."

TOOL USAGE:
- Single-client question → get_client_snapshot
- "Top movers / biggest changes" → get_weekly_movers
- "Alerts / problems / anything wrong" → get_recent_alerts
- "How many clients" → list_active_clients
- "Last posts from X" → get_client_posts

Keep every turn under 5 seconds of speech.
```

---

## Step 5 — Register tools (webhooks)

Add each tool. All use **POST** + **JSON body**.
All require header: `X-Voice-Secret: <your VOICE_WEBHOOK_SECRET>`

### Tool 1: get_client_snapshot
- **Description:** Get current follower counts and post totals for a single client across all platforms.
- **URL:** `$BASE/api/voice/tool/get_client_snapshot`
- **Parameters:**
  - `clientName` (string, required) — "the name of the client the user asked about"

### Tool 2: get_weekly_movers
- **Description:** Get the top clients who gained or lost the most followers this week.
- **URL:** `$BASE/api/voice/tool/get_weekly_movers`
- **Parameters:**
  - `limit` (number, optional, default 3) — how many movers to return

### Tool 3: get_recent_alerts
- **Description:** List high-priority alerts across all clients (competitor moves, engagement drops, etc.).
- **URL:** `$BASE/api/voice/tool/get_recent_alerts`
- **Parameters:**
  - `limit` (number, optional, default 5)

### Tool 4: list_active_clients
- **Description:** Count how many active clients are currently being tracked.
- **URL:** `$BASE/api/voice/tool/list_active_clients`
- **Parameters:** (none — send `{}`)

### Tool 5: get_client_posts
- **Description:** Get recent post performance for a single client.
- **URL:** `$BASE/api/voice/tool/get_client_posts`
- **Parameters:**
  - `clientName` (string, required)

---

## Step 6 — Lifecycle webhooks (for usage tracking)

Under agent **Webhooks** settings:

- **On conversation start:** `POST $BASE/api/voice/session/start`
- **On conversation end:** `POST $BASE/api/voice/session/end`
  (ElevenLabs sends `conversationId` and `durationSec` automatically)

Both need header `X-Voice-Secret`.

---

## Step 7 — Copy the Agent ID

After saving, copy the agent ID from the URL or the widget embed snippet.

Paste it into `.env.local`:

```
VOICE_AGENT_ID=agent_abc123xyz
VOICE_WEBHOOK_SECRET=<long random string, match what you put in dashboard>
VOICE_MONTHLY_MINUTE_CAP=60
```

60 minutes / month at Turbo v2.5 voice ≈ **$9-12** — under the $15 ceiling.

---

## Step 8 — Test it

1. Restart the API server: `node api/server.js`
2. Open `http://localhost:3099/voice.html`
3. You should see "Ready — click mic to talk" and the ElevenLabs widget
4. Say: *"How many clients do I have?"* → should say 35
5. Say: *"How's Daniel Sim doing?"* → should speak his IG + LinkedIn + Facebook numbers

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Widget never appears | Check `/api/voice/config` returns your agent ID |
| Agent says "Something went wrong" | Check `logs/voice/YYYY-MM.jsonl` for tool errors |
| Agent doesn't find clients | The fuzzy matcher is case-insensitive. Check `clients.json` names |
| "Monthly voice budget used up" | Delete or archive the current month's log file to reset |
| Tool calls fail with 403 | Webhook secret mismatch between ElevenLabs dashboard and `.env.local` |
| Tool calls fail with 429 | Rate limit (30/min per IP) — raise in `routes.js` if needed |

---

## Scaling beyond Phase 1

When you hit the 60-min cap consistently, options:

1. **Bump cap** to 120 min (~$18-24/mo) — still cheap
2. **Switch to DIY pipeline** — Deepgram STT + Gemini Flash + ElevenLabs TTS direct API call. ~60% cheaper per minute, but 2-3 weeks dev time.
3. **Phase 2:** embed same agent on `titanai.space` with different system prompt for lead-gen. Separate budget, separate agent.
