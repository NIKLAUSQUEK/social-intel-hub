# Comment Intelligence

Audience-voice feature: scrapes comments from IG + TikTok posts, classifies intent + sentiment via LLM, clusters similar comments, and generates content briefs.

## What you get per client

`data/{clientId}/comment-intel.json`:

```json
{
  "clientId": "daniel-sim",
  "commentCount": 487,
  "sentiment": { "positive": 0.62, "neutral": 0.28, "negative": 0.10, "mixed": 0.0 },
  "contentIdeas": [
    {
      "type": "fan_request",
      "title": "£10k to £1M: the realistic property path",
      "hook": "Most people think property starts at £100k. It doesn't.",
      "format": "Reel",
      "whyItWorks": "23 separate comments asking this exact question",
      "commentCount": 23,
      "platforms": ["instagram", "tiktok"],
      "sentiment": "positive",
      "examples": ["can you do a video on £10k deposit?", "what if I only have 10k..."]
    }
  ],
  "topQuestions": [...],
  "hateComments": [...],
  "fanRequests": [...],
  "costs": { "apify": 0.0023, "llmClassify": 0.0041, "llmSummary": 0.0007, "total": 0.0071 }
}
```

## Architecture

```
comments/
├── apify.js       IG + TikTok comment scrapers (Apify actors)
├── llm.js         Gemini → DeepSeek → Kimi fallback chain
├── analyse.js     pipeline: fetch → dedupe → classify → cluster → summarise
├── run.js         CLI entry, monthly budget guard
├── routes.js      Express router (mount at /api/audience)
└── README.md      this file

dashboard/
└── audience.html  UI — client picker, sentiment, ideas, questions, hate

voice/
├── tools.js       adds getAudienceAsks tool
└── routes.js      registers /tool/get_audience_asks webhook
```

## Required env vars (.env.local)

```
# Apify (reuses your existing token)
APIFY_TOKEN=apify_api_...

# LLM — primary + fallbacks (at least one required)
GEMINI_API_KEY=...
DEEPSEEK_API_KEY=...      # optional fallback
KIMI_API_KEY=...          # optional fallback

# Budget cap (USD/month)
COMMENTS_MONTHLY_USD_CAP=10

# Optional actor overrides (use defaults if unset)
# APIFY_IG_COMMENTS_ACTOR=apify/instagram-comment-scraper
# APIFY_TT_COMMENTS_ACTOR=clockworks/tiktok-comments-scraper
```

## Wiring (2 lines to add to api/server.js)

```js
import audienceRoutes from '../comments/routes.js';
app.use('/api/audience', audienceRoutes);
```

## Usage

```bash
# Dry-run cost estimate
node comments/run.js --dry-run

# Run for all active clients (needs posts-latest.json from scraper first)
node comments/run.js

# Single client
node comments/run.js --client daniel-sim

# Cap posts per platform
node comments/run.js --limit 20
```

## Cost model (April 2026)

Assumes 50 posts/platform × 30 comments avg × 50% dedupe = ~750 classified per client

| Component | Per client | 36 clients/week |
|---|---|---|
| Apify IG | $0.015 | $0.55 |
| Apify TikTok | $0.023 | $0.82 |
| Gemini Flash (classify) | $0.003 | $0.11 |
| Gemini Flash (summarise) | $0.0008 | $0.03 |
| **Total weekly** | **~$0.04** | **~$1.51** |
| **Total monthly** | | **~$6.50** |

Hard cap: `COMMENTS_MONTHLY_USD_CAP=10` — runner aborts if projected spend exceeds.

## Fallback chain (LLM)

Gemini Flash → DeepSeek v3 → Kimi (Moonshot)

| Provider | Input / 1M | Output / 1M | When used |
|---|---|---|---|
| Gemini 2.0 Flash | $0.075 | $0.30 | Primary — cheapest |
| DeepSeek v3 | $0.07 | $1.10 | If Gemini rate-limited |
| Kimi (Moonshot-v1) | $0.60 | $2.50 | Last-resort |

All three support JSON-structured output; classifier prompts are identical.

## Prompts (for tuning)

Both the classifier and summariser prompts live in `analyse.js` as top-level consts:

- `CLASSIFY_SYSTEM` — per-comment labeller
- `SUMMARY_SYSTEM` — cluster → content brief

Modify these rather than forking the file.

## Surfaces

### 1. Dashboard

`http://localhost:3099/audience.html` — per-client sentiment pie + ideas + fan requests + hate.

### 2. Voice agent

New ElevenLabs tool: `get_audience_asks` (webhook already wired).

Add this tool to the ElevenLabs agent dashboard:
- **Description:** Get audience sentiment, top content ideas, and recurring questions distilled from a client's comments
- **URL:** `$BASE/api/voice/tool/get_audience_asks`
- **Parameters:** `clientName` (string, required)

Sample user voice query: *"What are fans asking Daniel Sim about?"*

### 3. Weekly report (future)

To include in weekly email: read `comment-intel.json` alongside `report-latest.json` and format a summary section. Not yet wired — manual read-and-inject for now.

## Scheduling

Manual run weekly after the main scraper. Recommended: add to `scrape-daily.bat` (or new `scrape-weekly.bat`):

```bat
node scraper\index.js --mode weekly
node comments\run.js
```

Or invoke via Make.com on a weekly cron after scraper completes.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `APIFY_TOKEN missing` | Add to `.env.local` |
| No post URLs | Run main scraper first: `node scraper/index.js` |
| `All LLM providers failed` | Check at least one of GEMINI / DEEPSEEK / KIMI keys is valid |
| `Budget guard: exceed monthly cap` | Raise `COMMENTS_MONTHLY_USD_CAP` or wait for next month |
| Dashboard shows "No comment analysis" | Run `node comments/run.js --client <id>` |
| Actor output shape different from expected | Apify actors vary — check `apify.js` field normalisation block |

## Phase 2 ideas (not built)

- **Diff mode:** only classify new comments since last run (dedupe against last week's output)
- **Multi-week trends:** detect topics that went from 5% → 30% of comments as rising interest
- **Author clustering:** identify power-fans (repeat commenters across posts) vs drive-by haters
- **Cross-client patterns:** "this question came up for 4 different clients this week" → evergreen format
