# Deploying social-intel-hub to Vercel

This repo is configured to deploy as a single Vercel project. All requests flow
through `api/_vercel/index.js` which exports the Express app.

## What runs on Vercel

✅ Static dashboards (served by Express)
✅ All read endpoints (`/api/clients`, `/api/clients/:id/metrics`, etc.)
✅ Brand report generation (Pro plan — see function limits below)
✅ Proposal generator at `/proposals/`
✅ Pitch deck at `/pitch/`

## What does NOT run on Vercel (stays on your laptop)

❌ Playwright scrapers — no browser available
❌ Telegram bot polling — needs always-on process
❌ Long scheduled jobs — function timeout limit

Workflow: run scrapes locally, commit `data/` to the repo (or push via a
sidecar service), Vercel auto-redeploys with fresh data.

## One-time setup

### 1. Connect repo to Vercel

1. Push this repo to GitHub
2. Go to https://vercel.com/new
3. Import this repo
4. Framework preset: **Other**
5. Root directory: leave blank
6. Build command: leave blank (vercel.json handles it)
7. Click Deploy

### 2. Plan tier

- **Hobby (free):** function timeout 10s — only fast endpoints work. Brand reports will time out.
- **Pro ($20/mo):** function timeout 300s — everything works. Recommended.

### 3. Environment variables

Add these in Vercel → Project → Settings → Environment Variables. Same values
as your local `.env.local`:

```
ANTHROPIC_API_KEY
AZURE_OPENAI_API_KEY
AZURE_OPENAI_ENDPOINT
AZURE_OPENAI_MODEL
GEMINI_API_KEY
DEEPSEEK_API_KEY
KIMI_API_KEY
GROQ_API_KEY
OPENAI_API_KEY
SOCIALKIT_API_KEY
APIFY_TOKEN
EXA_API_KEY
TAVILY_API_KEY
BRAVE_SEARCH_API_KEY
REPLICATE_API_TOKEN
TELEGRAM_BOT_TOKEN
TELEGRAM_CLIENT_ROUTING
```

Mark all three environments (Production / Preview / Development).

### 4. Custom domain (optional)

Vercel → Settings → Domains → Add `intel.titanai.space` or similar.

## Local development

Same as before — `node api/server.js` boots on port 3099. Vercel-specific code
paths are gated by `if (!process.env.VERCEL)` so nothing breaks.

## Updating data

Run scrapes locally as usual:

```bash
npm run scrape:daily
```

Then commit and push:

```bash
git add data/
git commit -m "data: refresh scrape $(date +%Y-%m-%d)"
git push
```

Vercel rebuilds within ~30s.

## Function limits to know

| Endpoint | Typical duration | Hobby plan? |
|---|---|---|
| GET /api/clients | <100ms | ✓ |
| GET /api/clients/:id/metrics | <200ms | ✓ |
| GET /api/clients/:id/brand-report | <500ms (cached read) | ✓ |
| POST /api/analyse/:id/brand-report | 60-90s (LLM) | ✗ Pro needed |
| Static dashboards | <50ms (cold start ~500ms) | ✓ |

## Troubleshooting

| Symptom | Fix |
|---|---|
| 504 Gateway Timeout | Function exceeded 10s on Hobby — upgrade to Pro or split work |
| `MODULE_NOT_FOUND` | Run `npm install` locally and commit `package-lock.json` |
| API returns 404 | Check `vercel.json` rewrites are in place |
| Dashboard loads but data missing | `data/` is gitignored — either commit data or remove the gitignore line |
| Env var undefined in prod | Added to Hobby env only — must also tick Production |
