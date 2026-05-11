# Social Intel — Multi-Client Social Media Analytics Tracker

A self-contained social media analytics system with three components:

1. **Scraper** — Playwright-based scraper that pulls public metrics from Instagram, TikTok, and Facebook
2. **API** — Express server that serves client data as JSON endpoints
3. **Dashboard** — React component that displays analytics per client

## Quick Start

```bash
cd social-intel
npm install
npx playwright install chromium
```

### Run the scraper

```bash
# Scrape all active clients
npm run scrape

# Scrape a specific client
npm run scrape:client -- leong-mun-wai

# Skip Wayback Machine lookups (faster)
npm run scrape -- --no-wayback
```

### Start the API server

```bash
npm run api
# Runs on http://localhost:3099
```

### API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/clients` | List all clients |
| `GET /api/clients/:id/metrics` | Latest metrics for a client |
| `GET /api/clients/:id/history` | Historical data (scrape + Wayback) |
| `GET /api/clients/:id/posts` | Recent posts across platforms |
| `GET /api/clients/:id/report` | Weekly analysis report |

## Adding a new client

Edit `clients.json` and add a new entry:

```json
{
  "id": "new-client",
  "name": "New Client Name",
  "platforms": {
    "instagram": { "url": "https://www.instagram.com/username/", "username": "username" },
    "tiktok": { "url": "https://www.tiktok.com/@username", "username": "username" },
    "facebook": { "url": "https://www.facebook.com/pagename/", "username": "pagename" }
  },
  "active": true,
  "addedAt": "2026-04-07"
}
```

Then run `npm run scrape` to collect data.

## Dashboard

The `SocialTracker` component in `dashboard/SocialTracker.jsx` is self-contained and importable into any React app (including Lovable).

```jsx
import SocialTracker from './dashboard/SocialTracker';

// Optional: set a custom API base URL
window.SOCIAL_INTEL_API = 'https://your-api.com/api';

function App() {
  return <SocialTracker />;
}
```

## Data Structure

```
data/
  last-run.json          — summary of most recent scrape run
  {client-id}/
    metrics-latest.json  — current platform metrics
    posts-latest.json    — recent posts with engagement
    history.json         — follower count snapshots over time
    wayback.json         — Wayback Machine historical data
    report-latest.json   — weekly analysis report
    report-YYYY-MM-DD.json — archived reports
```

## Lovable Integration

The dashboard component fetches from REST endpoints, so to integrate with Lovable:

1. Deploy the API server (or use a serverless adapter)
2. Import `SocialTracker.jsx` into your Lovable app
3. Set `window.SOCIAL_INTEL_API` to point to your API URL

## Tech Stack

- Scraper: Node.js + Playwright
- API: Express.js + CORS
- Data: JSON files (Supabase-ready structure)
- Dashboard: React (zero external chart dependencies)
