# Developer Handoff — TITAN.AI Social Intel Hub

> **Purpose:** Take this standalone Node.js/Express app and merge it into the existing Python webapp at `titan-ai-research.vercel.app`. Shared Supabase auth, multi-tenant, OAuth-connected client analytics.
>
> **Status:** Standalone product is feature-complete and live. Merge work has not started.

## What this product is

A multi-client social media intelligence platform for an agency. 49 active clients across Instagram, TikTok, Facebook, LinkedIn, YouTube. Tracks followers, posts, engagement, identifies outliers, classifies post format + identity, generates brand reports + proposals via LLMs.

**Live demo:** https://social-intel-hub-git-main-niklauss-projects.vercel.app

## What's already built

| Layer | What |
|---|---|
| **Backend** (`api/`) | Express server with ~15 mounted route groups. Single entry: `api/server.js`. Vercel wrapper: `api/index.js`. |
| **Frontend** (`dashboard/`) | Vanilla HTML + JS dashboards. No build step. Multi-tab UI (Overview, Posts, Competitors, Trends, Calendar, etc.). |
| **Scrapers** (`scraper/`) | Playwright + SocialKit + Apify. Runs locally only (not on Vercel). |
| **LLM layer** (`api/lib/llm-v2.js`) | 6-tier fallback chain (Anthropic → Azure → Gemini → DeepSeek → Kimi → Make webhook). Routes by task tier (premium/standard/cheap). |
| **External APIs** (`external-apis/`) | Reddit, Tavily, Brave, NewsAPI, AssemblyAI, Twitter, Apify wrappers. |
| **Modules** | comments/, calendar/, competitor-discovery/, content-performance/, influence-network/, metrics/, notifications/, response-priority/, trend-jacking/, trending-audio/, trending-techniques/, voice/ — each has routes.js + analyse.js. |
| **Proposal generator** | `proposals/proposal-template.html` — self-contained, paste JSON → render 13-section client proposal. Also deployed standalone at github.com/NIKLAUSQUEK/titan-proposals. |
| **Pitch deck** | `presentation/index.html` — served at `/pitch/`. |

## What the merge needs to do — full spec

See **`docs/WEEK2-OAUTH-INTEGRATION.md`** — 6 tickets × 1 day each, copy-pasteable code samples for:
- Supabase JWT middleware (auth gate)
- Supabase schema migrations (clients + connections + sync_log + RLS)
- Instagram / TikTok / YouTube OAuth flows
- Token refresh worker on Make.com

## Recommended merge architecture

Reverse proxy at app root. Python app stays as the front door. social-intel-hub stays as Node/Express but mounted at `/intel/*`. One `vercel.json` line in the Python app:

```json
{
  "rewrites": [
    { "source": "/intel/:path*", "destination": "https://social-intel-hub-git-main-niklauss-projects.vercel.app/:path*" }
  ]
}
```

User sees one URL. Both apps share the same Supabase project for auth.

## Tech stack summary

- **Runtime:** Node 20+
- **Framework:** Express 4.19
- **Module system:** ESM (`"type": "module"` in package.json)
- **DB (current):** file-based JSON in `data/{clientId}/*.json`
- **DB (after merge):** hybrid — Supabase for auth+tokens+structured data; filesystem stays for posts/metrics
- **Hosting:** Vercel serverless function (all routes flow through `api/index.js`)

## Running locally

```bash
git clone https://github.com/NIKLAUSQUEK/social-intel-hub.git
cd social-intel-hub
npm install
# Create .env.local at parent dir or root with API keys (see DEPLOY.md)
node api/server.js
# → http://localhost:3099
```

## What does NOT run on Vercel

- Playwright scrapers (no browser available in serverless)
- Telegram bot polling (needs always-on process)
- Long-running scheduled jobs

These stay local on the founder's laptop for now. Scrape data lands in `data/`, gets committed and pushed when fresh data is needed in production.

## Open architectural questions for the engineer to clarify

1. **Team concept** — one user owns multiple clients, can invite collaborators? Or strictly one-user-one-account?
2. **Re-OAuth** — what happens if a client already has an Instagram connection and the user re-runs OAuth — overwrite or block?
3. **Make.com for refresh** — OK to use, or prefer Vercel cron?
4. **Token encryption at rest** — must-have for v1, or Phase 3?

## Useful reading order for a new dev

1. This file (you're reading it)
2. `DEPLOY.md` — how to ship to Vercel
3. `docs/WEEK2-OAUTH-INTEGRATION.md` — the actual implementation spec
4. `api/server.js` — see how routes are mounted
5. `api/lib/llm-v2.js` — the LLM routing logic
6. `dashboard/tabs.js` — front-end render pipeline

## Contact

Founder: future@titanai.space
