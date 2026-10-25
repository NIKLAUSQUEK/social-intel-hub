# Lead Gen — social lead finder

SocLeads-style lead finder: keyword + location in, scored and de-duplicated
lead list out (CSV). Public data only.

```bash
npm run leads -- --keywords "dentist,orthodontist" --location "Singapore" \
                 --sources instagram,facebook,linkedin,google-maps --limit 200 --out leads.csv
npm run leads -- --list-sources
npm run leads -- --suppress someone@example.com      # opt-out (email, @domain or URL)
npm run test:leads
```

Dashboard: `/leads.html`. API: `/api/leads` (see `routes.js`).

## Sources

| Source | How | Needs |
|---|---|---|
| `instagram` `facebook` `linkedin` `tiktok` `x` `youtube` | Search-API query for public profiles whose indexed bio matches keyword + location + contact hints | one of `BRAVE_SEARCH_API_KEY`, `TAVILY_API_KEY`, `EXA_API_KEY` |
| `facebook-groups` | Same, scoped to `facebook.com/groups` — returns groups to work by hand; a group becomes a lead only if its snippet has contact details | same |
| `google-maps` | Google Places API (New) Text Search | `GOOGLE_PLACES_API_KEY` |
| `youtube-api` | YouTube Data API v3 channel search + channel descriptions | `YOUTUBE_API_KEY` |
| `reddit` | Reddit API search, kept only for buying-intent posts | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` |

Leads with a website and no email are enriched from the homepage + one contact
page (robots.txt respected, 1 request/host every 1.5s, honest User-Agent).

## Env

| Var | Default |
|---|---|
| `LEADGEN_DATA_DIR` | `data/leads` (`/tmp/leads` on Vercel) |
| `LEADGEN_HOST_DELAY_MS` | `1500` |
| `LEADGEN_USER_AGENT` | `SocialIntelLeadBot/1.0 (+repo url)` |

## Guardrails (by design)

- No logins, no private groups, no headless-browser crawling of the social platforms.
- Every lead keeps `evidence[]` — where each detail came from.
- Suppression list is applied on every run.
- CSV export neutralises spreadsheet formulas.
- Before emailing anyone: check local law (PDPA in SG, GDPR in EU/UK, CAN-SPAM in US) — identify yourself, give an opt-out, and honour it with `--suppress`.
