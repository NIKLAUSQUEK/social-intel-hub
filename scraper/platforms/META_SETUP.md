# Meta Graph API — Setup Guide

Free unlimited Instagram scraping for Business/Creator accounts using the `business_discovery` endpoint. Becomes primary for IG once configured; Apify/SocialKit remain fallbacks.

## Requirements checklist

You already have:
- ✅ Verified Meta app (`TITAN SOCIAL INTEL`, app id `1459578472275983`)
- ✅ App ID + Secret in `.env.local`

You still need:
- ⏳ One Facebook Page (under your control)
- ⏳ One Instagram Business/Creator Account linked to that Page
- ⏳ A **Page Access Token** from that Page

## 5-minute setup

### 1. Confirm your IG is Business/Creator

- Open Instagram app → your profile → three-line menu → **Settings → Account type and tools**
- Should say **Business** or **Creator** account
- If it says Personal, switch it (free, 30 seconds)

### 2. Link IG to a Facebook Page

- Facebook → Page (any page you admin — create a dummy one if you don't have one)
- Page Settings → **Linked accounts → Instagram**
- Link your IG Business account
- Verify by reloading the Page — you'll see IG stats appear

### 3. Generate Page Access Token

Easiest path — use Meta's Graph API Explorer:

1. Go to https://developers.facebook.com/tools/explorer/
2. **Meta App:** select `TITAN SOCIAL INTEL`
3. Click **"Generate Access Token"**
4. In the permissions dialog, check:
   - `pages_show_list`
   - `pages_read_engagement`
   - `instagram_basic`
   - (optional) `instagram_manage_insights` — for audience demographics
5. After consenting, you now have a **User Access Token**
6. Paste this into the **Access Token** field in the Explorer
7. Make this GET request:
   ```
   GET /me/accounts?fields=id,name,access_token,instagram_business_account
   ```
8. Response gives you an array of Pages you admin. For each:
   - `access_token` = the **Page Access Token** you want
   - `instagram_business_account.id` = the **IG Business Account ID** you want

### 4. Paste into `.env.local`

```
META_IG_BUSINESS_ID=<instagram_business_account.id from step 3>
META_PAGE_ACCESS_TOKEN=<access_token from step 3>
```

Keep `META_APP_ID` and `META_APP_SECRET` as already set.

### 5. Extend the token to 60 days (recommended)

Page tokens from the Explorer expire in ~1 hour by default. Run this one-off command to swap it for a long-lived one (60 days):

```bash
cd C:\Users\nikki\Downloads\standalone\social-intel
node scraper/platforms/meta-cli.js extend
```

Copy the new token back into `.env.local`.

**After 60 days:** tokens with `instagram_basic` scope actually **never expire** when derived from a long-lived user token. Rare to need a refresh, but the script handles both cases.

### 6. Verify it works

```bash
node scraper/platforms/meta-cli.js ping
```

Expected:
```
✓ Meta Graph API working
  IG: @yourusername
  Followers: 1234
  Media: 56
```

Then test scraping a real public business account:

```bash
node scraper/platforms/meta-cli.js scrape leong.munwai
```

---

## What works vs what doesn't

| Target account type | Meta Graph API? | Notes |
|---|---|---|
| Instagram **Business** account | ✅ Free, unlimited | `business_discovery` returns profile + latest 25 media |
| Instagram **Creator** account | ✅ Free, unlimited | Same as Business |
| Instagram **Personal** account | ❌ Blocked | Switch them to Business/Creator, or fall back to Apify/SocialKit |
| Private account | ❌ Blocked | No API can scrape private accounts legally |

---

## Cost comparison

| Source | Profile + 25 posts | 100 clients weekly |
|---|---|---|
| **Meta Graph API** | free | **$0** |
| Apify | $0.015 | $1.50 |
| SocialKit | $0.024 | $2.40 |

Meta API is always preferred when the target is a Business/Creator account. For anyone Personal, the scraper automatically falls through.

---

## Rate limits

Meta Graph API v21.0:
- **200 calls per user per hour** per app — you're querying per "user" = your own IG Business Account
- At 36 clients × 1 scrape/day = 36 calls/day — nowhere near the limit
- Even aggressive: 36 clients × hourly scrapes = 864/day ≈ 36/hr = comfortable

If you add 100+ clients, consider a second app or request higher limits from Meta (they grant freely for legit use cases).

---

## Troubleshooting

| Error | Meaning | Fix |
|---|---|---|
| `(110) Query requires public user ID` | Target is Personal (not Business/Creator) | Fall through to Apify |
| `(24) requested fields unavailable` | Target is private | Can't scrape — legal limit |
| `(190) OAuthException` | Token expired | Re-run `meta-cli.js extend` |
| `(100) Invalid field` | Schema mismatch, Graph version drift | Update BASE version in `meta-graph.js` |
| `(4) rate limit` | >200 calls/hour | Space out scrapes or add more Pages |
