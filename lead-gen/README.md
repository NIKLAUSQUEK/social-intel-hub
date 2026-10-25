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
| `creators-instagram` `creators-tiktok` `creators-youtube` | Local creators in the niche, with follower count and tier (nano/micro/mid/macro) parsed from the indexed bio | search key |

Leads with a website and no email are enriched from the homepage + one contact
page (robots.txt respected, 1 request/host every 1.5s, honest User-Agent).

## Comment-to-DM (ManyChat-style)

Someone comments a keyword ("PRICE") on your Facebook or Instagram post or ad →
your Page sends them one private DM → they're stored as an inbox lead. If they
reply with an email or phone it's captured with consent; "STOP" opts them out.
Dashboard: `/comment-dm.html`. API: `/api/leads/dm` (`messenger/routes.js`).

Setup (once):

1. developers.facebook.com → create a **Business** app → add **Messenger** (and **Instagram** for IG).
2. Connect your Page; generate a Page access token → `META_PAGE_ACCESS_TOKEN`
   (several Pages: `META_PAGE_TOKEN_<pageId>`).
3. Webhook URL `https://<your-host>/api/leads/dm/webhook`, verify token = `META_VERIFY_TOKEN`,
   app secret → `META_APP_SECRET`. Subscribe the Page to `feed` + `messages`
   (Instagram: `comments` + `messages`).
4. Permissions for App Review: `pages_messaging`, `pages_read_engagement`,
   `pages_manage_metadata`, `pages_manage_engagement` (public replies); IG: `instagram_manage_comments`,
   `instagram_manage_messages`. Works for app admins/testers before review.
5. Add a rule in `/comment-dm.html`: Page ID, keywords, DM text.

Meta limits the code respects: one private reply per comment, within 7 days of
the comment; anything after that only inside the 24-hour window once they reply.

## Env

| Var | Default |
|---|---|
| `LEADGEN_DATA_DIR` | `data/leads` (`/tmp/leads` on Vercel) |
| `LEADGEN_HOST_DELAY_MS` | `1500` |
| `LEADGEN_USER_AGENT` | `SocialIntelLeadBot/1.0 (+repo url)` |
| `META_PAGE_ACCESS_TOKEN`, `META_APP_SECRET`, `META_VERIFY_TOKEN` | — (comment-to-DM) |
| `META_GRAPH_VERSION` | `v21.0` |

## Guardrails (by design)

- No logins, no private groups, no headless-browser crawling of the social platforms.
- Every lead keeps `evidence[]` — where each detail came from.
- Suppression list is applied on every run.
- CSV export neutralises spreadsheet formulas.
- Before emailing anyone: check local law (PDPA in SG, GDPR in EU/UK, CAN-SPAM in US) — identify yourself, give an opt-out, and honour it with `--suppress`.
