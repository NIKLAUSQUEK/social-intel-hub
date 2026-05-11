# Voice Agent — Phase 1 (Internal)

Voice interface for the Social Intel dashboard. Ask about clients, weekly movers, and alerts by speaking.

## What's built

```
voice/
├── tools.js         ← pure data readers (what the agent can call)
├── routes.js        ← Express router mounted at /api/voice
├── AGENT_SETUP.md   ← step-by-step ElevenLabs dashboard setup
└── README.md        ← this file

dashboard/
└── voice.html       ← frontend widget, served at /voice.html
```

## Architecture

```
Browser mic
    │
    ▼
ElevenLabs Conversational AI (hosted)
    ├─ STT (Whisper)
    ├─ LLM (gpt-4o-mini)
    └─ TTS (Turbo v2.5)
        │
        │ tool calls via webhook
        ▼
Your Express server  ──→  social-intel/data/*.json
```

Zero browser-side AI. Mic + audio only. All intelligence lives in ElevenLabs + your webhooks.

## One-line wiring (add to `api/server.js` yourself)

Above `app.use('/api/clients', clientRoutes);` add:

```js
import voiceRoutes from '../voice/routes.js';
app.use('/api/voice', voiceRoutes);
```

That's the only change needed to the existing server.

## Environment variables

Add to `.env.local`:

```
VOICE_AGENT_ID=<from ElevenLabs dashboard>
VOICE_WEBHOOK_SECRET=<long random string>
VOICE_MONTHLY_MINUTE_CAP=60
```

Generate a secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Cost model

| Item | Unit cost | @ 60 min/mo |
|---|---|---|
| ElevenLabs Conv AI (Creator plan, Turbo v2.5) | ~$0.08-0.15/min | **$5-9** |
| LLM (gpt-4o-mini via ElevenLabs) | ~$0.02/min bundled | bundled |
| Your server (no extra cost) | $0 | $0 |
| **Total** | | **$5-12/mo** |

Hard cap: `VOICE_MONTHLY_MINUTE_CAP=60`. Widget reads this from `/api/voice/session/check` and disables the mic when exceeded. Raise to 120 for $10-18/mo if you want more.

## Usage tracking

Every session writes a JSON line to `logs/voice/YYYY-MM.jsonl`:

```json
{"t":"2026-04-17T...","event":"session_start","conversationId":"c_abc"}
{"t":"2026-04-17T...","event":"tool_call","name":"get_client_snapshot","ms":23,"ok":true}
{"t":"2026-04-17T...","event":"session_end","conversationId":"c_abc","durationSec":142}
```

The minute cap is computed by summing `durationSec` across `session_end` events in the current month's file.

## Security

- All tool endpoints require `X-Voice-Secret` header
- Per-IP rate limit: 30 calls/min
- `/config` exposes agent ID only (public — agent ID alone is not a credential)
- Logs never contain PII or auth tokens

## Tool list (what the agent can do)

| Tool | Purpose | Sample phrase |
|---|---|---|
| `get_client_snapshot` | Live follower/post counts for one client | "How's Daniel Sim doing?" |
| `get_weekly_movers` | Top N clients with biggest weekly delta | "Top movers this week" |
| `get_recent_alerts` | High-priority alerts across portfolio | "Any alerts?" |
| `list_active_clients` | Total count of active clients | "How many clients?" |
| `get_client_posts` | Recent post performance for one client | "Last posts from John Abraham" |

Add more by editing `tools.js` + registering in `routes.js` + adding to the ElevenLabs agent config.

## Phase 2+ roadmap

| Phase | Scope | Build time | Added cost |
|---|---|---|---|
| 1 (now) | Internal voice on dashboard | 3 days | $5-12/mo |
| 2 | Embed on titanai.space as lead qualifier | 1 week | +$20-40/mo |
| 3 | Per-client briefing agent (weekly push) | 2-3 weeks | +$50-100/mo at 35 clients |
| 4 | DIY pipeline swap (Deepgram + Gemini + ElevenLabs TTS) | 2 weeks | -60% per minute |

## Checklist to ship Phase 1

- [ ] `npm install` (no new deps — uses existing Express)
- [ ] Add the 2-line import to `api/server.js`
- [ ] Set 3 env vars in `.env.local`
- [ ] Run ngrok or deploy with public URL
- [ ] Follow `AGENT_SETUP.md` in ElevenLabs dashboard
- [ ] Open `/voice.html`, say "How many clients do I have?"
- [ ] Confirm `logs/voice/2026-04.jsonl` has a `session_end` entry
