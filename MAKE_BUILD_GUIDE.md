# Social Intel — Make.com Cloud Fallback Build Guide

> **For:** Coworker building the Make.com scenarios
> **Team:** TITAN.AI (team ID: 1237045)
> **Organisation:** My Organization (ID: 6908521)
> **Last updated:** 2026-04-15

---

## How It Works (Big Picture)

```
PC Playwright Scraper (primary, free)
  │ runs daily when Nik's PC is on
  │ posts heartbeat to Make.com webhook on completion
  ▼
Make.com Heartbeat Receiver (Scenario A)
  │ logs "PC scraped today" in data store
  ▼
Make.com Fallback Scraper (Scenario B)
  │ runs daily at 22:00 UTC
  │ checks: "did PC scrape today?"
  │   YES → stop, do nothing
  │   NO  → run 3-tier fallback for ALL 4 PLATFORMS:
  │
  │   INSTAGRAM (34 accounts):
  │     Tier 1: Meta Graph API (free, business/creator accounts)
  │     Tier 2: Apify IG Profile Scraper (free tier, personal accounts)
  │     Tier 3: SocialKit (last resort, $0.0024/call)
  │
  │   TIKTOK (13 accounts):
  │     Tier 1: Apify TikTok Profile Scraper (free tier)
  │     Tier 2: SocialKit TikTok (last resort)
  │
  │   LINKEDIN (17 accounts):
  │     Tier 1: Apify LinkedIn Profile Scraper (free tier, no cookies)
  │     Tier 2: Skip (no free alternative)
  │
  │   FACEBOOK (2 accounts):
  │     Tier 1: Meta Graph API (free, Page Insights)
  │     Tier 2: Skip (only 2 accounts, low priority)
  │
  │ stores results in "Social Intel — Snapshots" data store
  │ sends Telegram alert
  ▼
Dashboard reads data store + local files
```

---

## Prerequisites (Nik to provide)

- [ ] **Meta Graph API token** — pending Meta developer verification (~2 days). See "How to Get Instagram Graph API" section below. Until verified, IG Tier 1 is skipped and Apify handles all IG accounts.
- [x] **Apify API token** — already have (same key for all actors: IG, TikTok, LinkedIn)
- [x] **SocialKit API key** — already have in `.env.local`
- [x] **Telegram bot token** — already have in `.env.local`
- [ ] **Telegram chat ID** — the group/channel ID to send alerts to

> **NOTE:** While Meta verification is pending (~2 days), build the scenario with Apify as IG Tier 1 instead. Once Meta is approved, slot the Graph API module in as Tier 1 and demote Apify to Tier 2. The structure is the same — just swap priority.

---

## SCENARIO A: PC Heartbeat Receiver

**Purpose:** When the PC scraper finishes, it POSTs results here. We log it so Scenario B knows not to run.

### Step 1: Create Webhook

1. Go to Webhooks → Create a webhook
2. Name: `Social Intel — PC Heartbeat`
3. Copy the URL → give to Nik to update `MAKE_WEBHOOK_URL` in `.env.local`
4. **NOTE:** There's already a `MAKE_WEBHOOK_URL` set in .env.local pointing to an existing hook. Check if it's the same or create a new one.

### Step 2: Build the Scenario

**Name:** `Social Intel — PC Heartbeat Receiver`
**Schedule:** Runs on webhook trigger (instant)

```
[1] TRIGGER: Custom Webhook
    └── Webhook: "Social Intel — PC Heartbeat"
    └── The PC scraper sends this JSON:
        {
          "event": "daily-scrape-complete",
          "completedAt": "2026-04-15T06:30:00.000Z",
          "clientsScraped": 34,
          "results": [
            {
              "clientId": "leong-mun-wai",
              "clientName": "Leong Mun Wai",
              "success": true,
              "instagram": 45000,
              "tiktok": 12000,
              "facebook": 8000,
              "linkedin": 5000,
              "error": null
            },
            ...
          ]
        }

[2] MODULE: Data Store → Add/Replace Record
    └── Data Store: "Social Intel — Snapshots" (ID: 112696)
    └── Key: formatDate(now; "YYYY-MM-DD") + "_heartbeat"
    └── Fields:
        clientId: "heartbeat"
        clientName: "PC Scraper Run"
        scrapedAt: {{1.completedAt}}
        igFollowers: 0
        igPosts: 0
        igFollowing: 0
        ttFollowers: 0
        ttLikes: 0
        ttVideos: 0
        jsonData: {{toString(1)}}

[3] MODULE: Iterator
    └── Array: {{1.results}}

[4] MODULE: Data Store → Add/Replace Record
    └── Data Store: "Social Intel — Snapshots" (ID: 112696)
    └── Key: formatDate(now; "YYYY-MM-DD") + "_" + {{3.clientId}}
    └── Fields:
        clientId: {{3.clientId}}
        clientName: {{3.clientName}}
        scrapedAt: {{1.completedAt}}
        igFollowers: {{3.instagram}}
        ttFollowers: {{3.tiktok}}
        jsonData: ""
```

**Activate** this scenario. Set to: On (instant/webhook-triggered).

---

## SCENARIO B: Cloud Fallback Scraper

**Purpose:** If the PC didn't scrape by 10 PM, this kicks in and scrapes all 34 clients using free APIs first, paid APIs as last resort.

**Name:** `Social Intel — Cloud Fallback (Daily)`
**Schedule:** Every day at 22:00 UTC (10 PM London / 6 AM+1 SGT)

---

### Module 1: Scheduled Trigger

- Type: Schedule
- Interval: Every day
- Time: 22:00 UTC

---

### Module 2: Data Store → Search Records (check heartbeat)

- Data Store: "Social Intel — Snapshots" (ID: 112696)
- Filter: Key `equals` formatDate(now; "YYYY-MM-DD") + "_heartbeat"
- Limit: 1

---

### Module 3: Router

**Route 1: "PC already scraped — stop"**
- Filter condition: Module 2 returned results (totalRecords > 0)
- Action: No modules — empty route (scenario stops here)

**Route 2: "PC missed — run fallback"**
- Filter condition: Module 2 returned 0 results (totalRecords = 0)
- This is the fallback chain — all remaining modules go here

---

### Module 4: Set Variable — Client List

Set a variable called `clientList` with this JSON array (all 34 clients, ALL 4 PLATFORMS):

```json
[
  {"id":"leong-mun-wai","name":"Leong Mun Wai","ig":"leong.munwai","tt":"leong.munwai","li":"leong-mun-wai","fb":"leongmwofficial"},
  {"id":"john-abraham","name":"John Abraham","ig":"johnabraham.rapid","tt":null,"li":"john-abraham-physio","fb":null},
  {"id":"jordan-yeoh","name":"Jordan Yeoh","ig":"jordanyeohfitness","tt":"jordanyeohofficial","li":null,"fb":"jordanyeohfitness"},
  {"id":"joshua-chan","name":"Joshua Chan","ig":"heyjoshchan","tt":"heyjoshchan","li":"joshua-c-448995229","fb":null},
  {"id":"kevin-wee","name":"Kevin Wee","ig":"k.weee","tt":null,"li":"kevin-wee-rwr","fb":null},
  {"id":"kevin-wee-radical-kindness","name":"Kevin Wee (Radical Kindness)","ig":"radical_kindness_","tt":"radical_kindness_","li":null,"fb":null},
  {"id":"ray-fu","name":"Ray Fu","ig":"raycfu","tt":"ray_fu","li":null,"fb":null},
  {"id":"tyler-tometich","name":"Tyler Tometich","ig":"tylertometich","tt":"tylertometich","li":"tylertometich","fb":null},
  {"id":"filiano","name":"Filiano","ig":"filianspyre","tt":null,"li":null,"fb":null},
  {"id":"declann-drostan-tan","name":"Declann Drostan Tan","ig":"__diditee__","tt":"__diditee__","li":null,"fb":null},
  {"id":"marek-knobloch","name":"Marek Knobloch","ig":"bymarc.ai","tt":null,"li":null,"fb":null},
  {"id":"nahid-maz","name":"Nahid Maz","ig":"Nahidhere79","tt":null,"li":null,"fb":null},
  {"id":"tara","name":"Tara Khoo","ig":"noproteinshakes","tt":null,"li":"tara-khoo-49702b179","fb":null},
  {"id":"martin-desouza","name":"Martin Desouza","ig":"martindesza","tt":"martindesza","li":"desouzamartin","fb":null},
  {"id":"gabe-chia","name":"Gabe Chia","ig":"gabechiaa","tt":null,"li":"gabe-chia-ba9988217","fb":null},
  {"id":"balaji-selfrunning-clinic","name":"Balaji (Self Running Clinic)","ig":"selfrunningclinic.coach","tt":null,"li":"balajipremchand","fb":null},
  {"id":"balaji-heartland-rehab","name":"Balaji (Heartland Rehab)","ig":"heartlandrehabsg","tt":null,"li":"balajipremchand","fb":null},
  {"id":"balaji-city-rehab","name":"Balaji (City Rehab)","ig":"cityrehabsg","tt":null,"li":"balajipremchand","fb":null},
  {"id":"heal360-physioclinic","name":"Heal360 Physioclinic","ig":"physioclinic","tt":null,"li":null,"fb":null},
  {"id":"bryan-ang","name":"Bryan Ang Zhi-Wei","ig":"bryanangzw","tt":null,"li":"bryan-ang-zhi-wei","fb":null},
  {"id":"melvin-soh","name":"Melvin Soh","ig":"thegreatmelvinsoh","tt":null,"li":"melvin-soh-669709194","fb":null},
  {"id":"david-chua","name":"David Chua","ig":"davidkychua","tt":null,"li":null,"fb":null},
  {"id":"do-hoang-phuc","name":"Do Hoang Phuc","ig":"etzondop","tt":null,"li":null,"fb":null},
  {"id":"business-academy-podcast","name":"Business Academy Podcast","ig":"the_businessacademyofficial","tt":null,"li":null,"fb":null},
  {"id":"wayne-yap","name":"Wayne Yap","ig":"wayneswritings","tt":null,"li":null,"fb":null},
  {"id":"gabriel-judah","name":"Gabriel Judah","ig":"gabrieljudah_","tt":null,"li":null,"fb":null},
  {"id":"bryan-johnson","name":"Bryan Johnson","ig":"bryanjohnson_","tt":"_bryan_johnson_","li":null,"fb":null},
  {"id":"nick-saraev","name":"Nick Saraev","ig":"nick_saraev","tt":null,"li":"nick-saraev","fb":null},
  {"id":"grant-mitterlehner","name":"Grant Mitterlehner","ig":"grantmitt","tt":"grantmitt","li":"grant-mitterlehner-966343a9","fb":null},
  {"id":"audrey","name":"Audrey","ig":"softgirlnocode","tt":"softgirlnocode","li":null,"fb":null},
  {"id":"leann-lai","name":"LeAnn Lai","ig":"leann.llx","tt":"leann.llx","li":"le-ann-lai-73a96b21b","fb":null},
  {"id":"olivia-cho","name":"Olivia Cho","ig":"oliviacho_","tt":null,"li":null,"fb":null},
  {"id":"bret-contreras","name":"Bret Contreras","ig":"bretcontreras1","tt":"gluteguy","li":null,"fb":null},
  {"id":"jay-ng","name":"Jay Ng","ig":"jay.junjie","tt":null,"li":"jayngjunjie","fb":null}
]
```

**Platform counts:** 34 IG | 13 TikTok | 17 LinkedIn | 2 Facebook
**IMPORTANT:** When adding new clients later, this array MUST be updated too.

---

### Module 5: Iterator

- Array: `{{4.clientList}}` (parsed JSON from Module 4)
- This loops through all 34 clients one at a time

---

### Module 6: HTTP — TIER 1: Meta Graph API (FREE — Instagram)

> This is the free, official Meta API. Works for business/creator IG accounts.

- **Module:** HTTP → Make a Request
- **URL:**
  ```
  https://graph.facebook.com/v21.0/{{META_IG_USER_ID}}?fields=business_discovery.username({{5.ig}}){username,followers_count,media_count,biography}&access_token={{META_ACCESS_TOKEN}}
  ```
- **Method:** GET
- **Parse response:** Yes
- **Error handling:** Set to **Continue** (don't stop on error — personal accounts will fail here, that's expected)

Where:
- `META_IG_USER_ID` = your own connected Instagram business account ID (see setup section below)
- `META_ACCESS_TOKEN` = long-lived token (see setup section below)
- `{{5.ig}}` = the current client's Instagram username from the iterator

**Expected success response:**
```json
{
  "business_discovery": {
    "username": "heyjoshchan",
    "followers_count": 12500,
    "media_count": 340,
    "biography": "Content creator...",
    "id": "17841400..."
  }
}
```

**Expected failure (personal account):** HTTP 400 with error "not a business account" → handled by Continue, flows to Tier 2.

---

### Module 7: Router (after IG attempt)

**Route A: "Graph API succeeded"**
- Filter: Module 6 status code = 200 AND response body contains "followers_count"
- → Go to Module 8 (save result)

**Route B: "Graph API failed — try Apify"**
- Filter: Module 6 status code ≠ 200 OR error occurred
- → Go to Module 9 (Apify fallback)

---

### Module 8: Set Variable — IG Result (from Graph API)

- `igFollowers`: {{6.body.business_discovery.followers_count}}
- `igPosts`: {{6.body.business_discovery.media_count}}
- `igSource`: "meta-graph-api"
- → Skip to Module 11 (TikTok)

---

### Module 9: HTTP — TIER 2: Apify (FREE tier — personal IG accounts)

> Apify free tier gives $5/mo credits ≈ 1,900 profile scrapes. This only fires for accounts that failed the Graph API (personal accounts), so usage will be low.

- **Module:** HTTP → Make a Request
- **URL:** `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items`
- **Method:** POST
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer {{APIFY_API_TOKEN}}`
- **Body:**
  ```json
  {
    "usernames": ["{{5.ig}}"],
    "resultsLimit": 1
  }
  ```
- **Parse response:** Yes
- **Timeout:** 60 seconds (Apify runs take time)
- **Error handling:** Continue

**Expected response:** Array with one object:
```json
[
  {
    "username": "filianspyre",
    "followersCount": 5200,
    "followsCount": 300,
    "postsCount": 120,
    "biography": "...",
    ...
  }
]
```

---

### Module 10: Set Variable — IG Result (from Apify)

- If Module 9 succeeded:
  - `igFollowers`: {{9.body[].followersCount}}
  - `igPosts`: {{9.body[].postsCount}}
  - `igSource`: "apify"
- If Module 9 also failed:
  - → **TIER 3: SocialKit** (add HTTP module here):
    - URL: `https://api.socialkit.dev/instagram/channel-stats?access_key={{SOCIALKIT_API_KEY}}&url=https://www.instagram.com/{{5.ig}}/`
    - Method: GET
    - Parse response: Yes
    - `igFollowers`: {{response.data.followers}}
    - `igSource`: "socialkit"
  - Error handling: Continue (if all 3 fail, log 0)

---

### Module 11: HTTP — TIKTOK (13 accounts)

> **Filter:** Only execute if `{{5.tt}}` is not empty

#### Tier 1: Apify TikTok Profile Scraper (FREE tier)

- **Module:** HTTP → Make a Request
- **URL:** `https://api.apify.com/v2/acts/clockworks~tiktok-profile-scraper/run-sync-get-dataset-items?token={{APIFY_API_TOKEN}}`
- **Method:** POST
- **Headers:**
  - `Content-Type: application/json`
- **Body:**
  ```json
  {
    "profiles": ["https://www.tiktok.com/@{{5.tt}}"],
    "resultsPerPage": 1,
    "shouldDownloadVideos": false
  }
  ```
- **Parse response:** Yes
- **Timeout:** 120 seconds (Apify actors need time to spin up)
- **Error handling:** Continue

**Expected response:**
```json
[
  {
    "uniqueId": "heyjoshchan",
    "nickname": "Joshua Chan",
    "followers": 15200,
    "following": 340,
    "hearts": 890000,
    "videoCount": 120,
    "verified": false,
    "signature": "Bio text..."
  }
]
```

**Extract:**
- `ttFollowers`: {{11.body[].followers}}
- `ttLikes`: {{11.body[].hearts}}
- `ttVideos`: {{11.body[].videoCount}}
- `ttSource`: "apify"

#### Tier 2: SocialKit TikTok (if Apify fails)

- **Filter:** Only if Module 11 errored
- **URL:** `https://api.socialkit.dev/tiktok/channel-stats?access_key={{SOCIALKIT_API_KEY}}&url=https://www.tiktok.com/@{{5.tt}}`
- **Method:** GET
- **Parse response:** Yes
- **Error handling:** Continue

---

### Module 12: HTTP — LINKEDIN (17 accounts)

> **Filter:** Only execute if `{{5.li}}` is not empty

#### Tier 1: Apify LinkedIn Profile Scraper (FREE tier, no cookies needed)

- **Module:** HTTP → Make a Request
- **URL:** `https://api.apify.com/v2/acts/curious_coder~linkedin-profile-scraper/run-sync-get-dataset-items?token={{APIFY_API_TOKEN}}`
- **Method:** POST
- **Headers:**
  - `Content-Type: application/json`
- **Body:**
  ```json
  {
    "profileUrls": ["https://www.linkedin.com/in/{{5.li}}/"]
  }
  ```
- **Parse response:** Yes
- **Timeout:** 120 seconds
- **Error handling:** Continue

**Expected response:**
```json
[
  {
    "name": "Joshua Chan",
    "headline": "Content Creator",
    "location": "Singapore",
    "followersCount": 2500,
    "connectionsCount": 500,
    "about": "Bio text...",
    "currentCompany": "...",
    "profileUrl": "https://www.linkedin.com/in/joshua-c-448995229/"
  }
]
```

**Extract:**
- `liFollowers`: {{12.body[].followersCount}}
- `liConnections`: {{12.body[].connectionsCount}}
- `liSource`: "apify"

> **No Tier 2 for LinkedIn** — Apify is the only free option. If it fails, log 0 and flag in Telegram alert. SocialKit doesn't cover LinkedIn.

---

### Module 13: HTTP — FACEBOOK (2 accounts only)

> **Filter:** Only execute if `{{5.fb}}` is not empty
> Currently only Leong Mun Wai and Jordan Yeoh have Facebook pages.

#### Tier 1: Meta Graph API (FREE — Page Insights)

> Uses the same Meta token as Instagram. Facebook Pages are always accessible via Graph API.

- **Module:** HTTP → Make a Request
- **URL:** `https://graph.facebook.com/v21.0/{{5.fb}}?fields=name,fan_count,followers_count,talking_about_count&access_token={{META_ACCESS_TOKEN}}`
- **Method:** GET
- **Parse response:** Yes
- **Error handling:** Continue

**Expected response:**
```json
{
  "name": "Leong Mun Wai",
  "fan_count": 8500,
  "followers_count": 9200,
  "talking_about_count": 150,
  "id": "..."
}
```

**Extract:**
- `fbFollowers`: {{13.body.followers_count}}
- `fbPageLikes`: {{13.body.fan_count}}
- `fbSource`: "meta-graph-api"

> **No Tier 2 for Facebook** — only 2 accounts, low priority. If Graph API fails, log 0.

---

### Module 15: Data Store → Add/Replace Record (per client)

> This is INSIDE the iterator loop — runs once per client.

- **Data Store:** "Social Intel — Snapshots" (ID: 112696)
- **Key:** `formatDate(now; "YYYY-MM-DD")` + `"_"` + `{{5.id}}`
- **Fields:**
  - `clientId`: {{5.id}}
  - `clientName`: {{5.name}}
  - `scrapedAt`: {{formatDate(now; "YYYY-MM-DDTHH:mm:ss.000Z")}}
  - `igFollowers`: {{igFollowers}} (from Module 8 or 10)
  - `igPosts`: {{igPosts}} (or 0)
  - `igFollowing`: 0
  - `ttFollowers`: {{ttFollowers}} (from Module 11, or 0)
  - `ttLikes`: {{ttLikes}} (or 0)
  - `ttVideos`: {{ttVideos}} (or 0)
  - `jsonData`: JSON string with ALL platform results:
    ```
    {"li":{"followers":{{liFollowers}},"connections":{{liConnections}}},"fb":{"followers":{{fbFollowers}},"pageLikes":{{fbPageLikes}}},"sources":{"ig":"{{igSource}}","tt":"{{ttSource}}","li":"{{liSource}}","fb":"{{fbSource}}"}}
    ```

---

### Module 16: Aggregator — Count Results

> This runs AFTER the iterator completes (outside the loop).

After the iterator completes, use a **Numeric Aggregator** to count:
- Total clients processed (count all bundles)
- Use **Text Aggregator** to build a summary string of failed clients

---

### Module 17: HTTP → Telegram Alert

- **URL:** `https://api.telegram.org/bot{{TELEGRAM_BOT_TOKEN}}/sendMessage`
- **Method:** POST
- **Body:**
  ```json
  {
    "chat_id": "{{TELEGRAM_CHAT_ID}}",
    "text": "⚠️ Social Intel Fallback Report\n\nPC scraper didn't run today.\nCloud fallback completed:\n\n📸 Instagram: 34 accounts attempted\n🎵 TikTok: 13 accounts attempted\n💼 LinkedIn: 17 accounts attempted\n📘 Facebook: 2 accounts attempted\n\n✅ Total clients saved: {{16.count}}/34\n❌ Failed: {{16.failedList}}\n\nTier breakdown in data store.\nSource: Make.com fallback",
    "parse_mode": "HTML"
  }
  ```

---

### Module 18: Data Store → Log Heartbeat (fallback)

- **Data Store:** "Social Intel — Snapshots" (ID: 112696)
- **Key:** `formatDate(now; "YYYY-MM-DD")` + `"_heartbeat"`
- **Fields:**
  - clientId: "heartbeat-fallback"
  - clientName: "Make.com Fallback Run"
  - scrapedAt: now
  - jsonData: `{"source":"make-fallback","clientsScraped":{{16.count}}}`

This ensures tomorrow's check sees that today was covered (prevents double-runs).

---

## Module Flow Summary (Scenario B)

```
[1] Schedule Trigger (22:00 UTC daily)
[2] Data Store: Search for today's heartbeat
[3] Router: PC ran? → stop | PC missed? → continue
[4] Set Variable: 34-client JSON array
[5] Iterator: loop each client
  ├── [6] IG Tier 1: Meta Graph API (free)
  ├── [7] Router: Graph API ok? → save | failed? → Apify
  ├── [8] Set Variable: IG result (Graph API)
  ├── [9] IG Tier 2: Apify (free tier)
  ├── [10] Set Variable: IG result (Apify) / Tier 3: SocialKit
  ├── [11] TikTok: Apify → SocialKit fallback
  ├── [12] LinkedIn: Apify (no fallback)
  ├── [13] Facebook: Meta Graph API (no fallback)
  └── [15] Data Store: save per-client record
[16] Aggregator: count results
[17] Telegram: send alert
[18] Data Store: log fallback heartbeat
```

---

## How to Get Instagram Graph API (FREE)

### What You Need
1. A Facebook Page connected to an Instagram Business/Creator account
2. A Meta Developer App
3. A long-lived access token

### Step-by-Step

#### 1. Convert Your IG to Business Account
- Go to Instagram → Settings → Account → Switch to Professional Account
- Choose "Business" or "Creator"
- Connect to a Facebook Page (create one if needed — can be a placeholder "TITAN.AI Analytics" page)

#### 2. Create a Meta Developer App
1. Go to https://developers.facebook.com/apps/
2. Click "Create App" → Choose "Business" type
3. App name: "TITAN Social Intel"
4. Add the "Instagram Graph API" product

#### 3. Get Your Instagram Business Account ID
1. In Graph API Explorer (https://developers.facebook.com/tools/explorer/)
2. Select your app
3. Get a User Token with permissions: `instagram_basic`, `pages_show_list`, `pages_read_engagement`
4. Query: `GET /me/accounts` → find your Page ID
5. Query: `GET /{page-id}?fields=instagram_business_account` → this returns your IG User ID
6. **Save this ID** — it's the `META_IG_USER_ID` used in Module 6

#### 4. Generate a Long-Lived Token
1. Short-lived token from Graph API Explorer (valid 1 hour)
2. Exchange for long-lived token (valid 60 days):
   ```
   GET https://graph.facebook.com/v21.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id={{META_APP_ID}}
     &client_secret={{META_APP_SECRET}}
     &fb_exchange_token={{SHORT_LIVED_TOKEN}}
   ```
3. **Save this token** as `META_ACCESS_TOKEN`

#### 5. Auto-Refresh (IMPORTANT)
Long-lived tokens expire after 60 days. To avoid manual refresh:
- Create a Make.com scenario that runs every 50 days
- It calls the token refresh endpoint and updates the stored token
- OR: Use a System User token (never expires) — requires Business Manager

### What Accounts Will Work

The Business Discovery API returns data for any **public** account that is set to **Business** or **Creator** mode. You do NOT need the account owner's permission.

**Will work:** Most influencers and businesses (they use creator/business accounts for insights)
**Won't work:** Personal/private accounts → these fall through to Apify (Tier 2)

### Testing Which Clients Work

After getting your token, test each client in Graph API Explorer:
```
GET /{your-ig-id}?fields=business_discovery.username(heyjoshchan){followers_count}
```

If it returns data → Business/Creator account ✅
If it returns error → Personal account, needs Apify fallback ⚠️

---

## Personal Account Fallback Strategy

For the ~20% of accounts that may be personal (not business/creator):

| Tier | Method | Cost | Works On |
|------|--------|------|----------|
| 1 | Meta Graph API | FREE | Business + Creator accounts |
| 2 | Apify Free Tier | FREE ($5/mo credits) | Any public account (including personal) |
| 3 | SocialKit API | $0.0024/call | Any public account |
| 4 | Manual flag | $0 | Private accounts → Telegram alert to check manually |

**Estimated breakdown for 34 clients:**
- ~25-28 will be business/creator → Graph API (free)
- ~4-7 will be personal → Apify (free tier covers this)
- ~0-2 might be private → flagged for manual check
- SocialKit should rarely fire (emergency only)

**Monthly API cost estimate: $0**

---

## Operations Budget

| Scenario | Ops per run | Runs/month | Monthly ops |
|----------|------------|------------|-------------|
| A: Heartbeat Receiver | ~40 (webhook + 34 data store writes) | ~30 | ~1,200 |
| B: Fallback (when PC misses) | ~450 (iterator × 4 platforms × HTTP + data store) | ~5-10 | ~2,250-4,500 |
| **Total** | | | **~3,500-5,700** |

**Budget:** 480,000 ops/month → uses **~1%**. No concern.

**At 100 clients:** ~1,200 ops/fallback run → ~12,000/mo. Still only 2.5%.
**At 200 clients:** ~2,400 ops/fallback run → ~24,000/mo. Still only 5%.

---

## Secrets to Configure in Make.com

Create these as **Make.com Variables** (or hardcode in modules):

| Variable | Where to get it | Notes |
|----------|----------------|-------|
| `META_IG_USER_ID` | Graph API Explorer (see above) | Your connected IG business account ID |
| `META_ACCESS_TOKEN` | Token exchange (see above) | Refresh every 50 days or use System User |
| `APIFY_API_TOKEN` | Already have — same token for all Apify actors (IG, TT, LI) | Free tier = $5/mo credits |
| `SOCIALKIT_API_KEY` | Already in .env.local | Last resort only |
| `TELEGRAM_BOT_TOKEN` | Already in .env.local | For alerts |
| `TELEGRAM_CHAT_ID` | Ask Nik | Group/channel for alerts |

---

## Cleanup: Deactivate Old Scenarios

These old single-client scenarios are replaced by the universal fallback:

- [ ] **Deactivate** "Social Intel — Leong Mun Wai Weekly Scrape" (ID: 5209519)
- [ ] **Deactivate** "Social Intel — John Abraham Weekly Scrape" (ID: 5209476) — already inactive

---

## Adding New Clients Later

When Nik adds a new client to `clients.json`:

1. Add the client to the `clientList` JSON array in **Module 4** of Scenario B
2. Format: `{"id":"new-client-id","name":"Display Name","ig":"ig_username","tt":"tt_or_null","li":"li_slug_or_null","fb":"fb_page_or_null"}`
3. No other changes needed — the iterator, all tiers, and all 4 platform modules handle it automatically
4. Also create the data directory: `data/{client-id}/`

---

## Testing Checklist

- [ ] Scenario A: Send a test POST to the webhook with sample payload → confirm data store record created
- [ ] Scenario B: Temporarily set schedule to "once" → run manually → confirm it detects no heartbeat and runs fallback
- [ ] **IG Tier 1:** Confirm Meta Graph API returns followers for at least 1 business account (e.g. leong.munwai)
- [ ] **IG Tier 2:** Confirm Apify IG scraper returns data for a personal account (e.g. filianspyre)
- [ ] **IG Tier 3:** Confirm SocialKit fires only when Tiers 1+2 both fail
- [ ] **TikTok:** Confirm Apify TikTok Profile Scraper returns followers for e.g. heyjoshchan
- [ ] **LinkedIn:** Confirm Apify LinkedIn Profile Scraper returns followersCount for e.g. tylertometich
- [ ] **Facebook:** Confirm Meta Graph API returns fan_count for leongmwofficial
- [ ] **Filters:** Confirm TikTok module skips clients with no TT (e.g. filiano), LinkedIn skips clients with no LI
- [ ] Telegram: Confirm alert message arrives with counts for all 4 platforms
- [ ] Data store: Confirm per-client records contain IG + TT + LI + FB data in jsonData field
- [ ] End-to-end: Run PC scraper → confirm Scenario B detects heartbeat and stops
- [ ] **Data store cleanup:** Confirm old records (> 7 days) are being purged

---

## Architecture Diagram

```
                    ┌──────────────────────────┐
                    │   PC (Playwright)         │
                    │   Daily 06:00 UTC         │
                    │   34 clients × 4 platforms│
                    │   FREE                    │
                    └──────────┬───────────────┘
                               │ POST heartbeat
                               ▼
                    ┌──────────────────────────┐
                    │  SCENARIO A               │
                    │  Webhook Receiver          │
                    │  Logs to Data Store        │
                    └──────────┬───────────────┘
                               │
          ┌────────────────────┴──────────────────┐
          │                                        │
          ▼                                        ▼
  ┌──────────────┐                      ┌──────────────────┐
  │  PC ran ✅    │                      │  PC missed ⚠️     │
  │  Do nothing   │                      │  SCENARIO B runs  │
  └──────────────┘                      └────────┬─────────┘
                                                  │
                    ┌─────────────────────────────┼──────────────┐
                    │                             │              │
                    ▼                             ▼              ▼
          ┌──────────────────┐          ┌──────────────┐  ┌──────────┐
          │ INSTAGRAM (34)   │          │ TIKTOK (13)  │  │ LAST     │
          │ T1: Meta Graph   │          │ T1: Apify    │  │ RESORT   │
          │     API (FREE)   │          │    (FREE)    │  │ Social   │
          │ T2: Apify (FREE) │          │ T2: Social   │  │ Kit API  │
          │ T3: SocialKit    │          │     Kit      │  │ $0.0024  │
          └──────────────────┘          └──────────────┘  └──────────┘
                    │                             │
          ┌──────────────────┐          ┌──────────────┐
          │ LINKEDIN (17)    │          │ FACEBOOK (2) │
          │ T1: Apify (FREE) │          │ T1: Meta     │
          │ No T2 (skip)     │          │   Graph API  │
          └──────────────────┘          └──────────────┘
                    │                             │
                    └──────────┬──────────────────┘
                               ▼
                    ┌──────────────────────────┐
                    │  Data Store (ID: 112696)  │
                    │  + Telegram alert         │
                    │  + Fallback heartbeat     │
                    └──────────────────────────┘
```

---

## Full Client List Reference (34 clients, all 4 platforms)

| # | Client | IG | TT | LI | FB |
|---|--------|----|----|----|----|
| 1 | Leong Mun Wai | leong.munwai | leong.munwai | leong-mun-wai | leongmwofficial |
| 2 | John Abraham | johnabraham.rapid | — | john-abraham-physio | — |
| 3 | Jordan Yeoh | jordanyeohfitness | jordanyeohofficial | — | jordanyeohfitness |
| 4 | Joshua Chan | heyjoshchan | heyjoshchan | joshua-c-448995229 | — |
| 5 | Kevin Wee | k.weee | — | kevin-wee-rwr | — |
| 6 | Kevin Wee (RK) | radical_kindness_ | radical_kindness_ | — | — |
| 7 | Ray Fu | raycfu | ray_fu | — | — |
| 8 | Tyler Tometich | tylertometich | tylertometich | tylertometich | — |
| 9 | Filiano | filianspyre | — | — | — |
| 10 | Declann Drostan Tan | __diditee__ | __diditee__ | — | — |
| 11 | Marek Knobloch | bymarc.ai | — | — | — |
| 12 | Nahid Maz | Nahidhere79 | — | — | — |
| 13 | Tara Khoo | noproteinshakes | — | tara-khoo-49702b179 | — |
| 14 | Martin Desouza | martindesza | martindesza | desouzamartin | — |
| 15 | Gabe Chia | gabechiaa | — | gabe-chia-ba9988217 | — |
| 16 | Balaji (SRC) | selfrunningclinic.coach | — | balajipremchand | — |
| 17 | Balaji (HR) | heartlandrehabsg | — | balajipremchand | — |
| 18 | Balaji (CR) | cityrehabsg | — | balajipremchand | — |
| 19 | Heal360 | physioclinic | — | — | — |
| 20 | Bryan Ang | bryanangzw | — | bryan-ang-zhi-wei | — |
| 21 | Melvin Soh | thegreatmelvinsoh | — | melvin-soh-669709194 | — |
| 22 | David Chua | davidkychua | — | — | — |
| 23 | Do Hoang Phuc | etzondop | — | — | — |
| 24 | Business Academy | the_businessacademyofficial | — | — | — |
| 25 | Wayne Yap | wayneswritings | — | — | — |
| 26 | Gabriel Judah | gabrieljudah_ | — | — | — |
| 27 | Bryan Johnson | bryanjohnson_ | _bryan_johnson_ | — | — |
| 28 | Nick Saraev | nick_saraev | — | nick-saraev | — |
| 29 | Grant Mitterlehner | grantmitt | grantmitt | grant-mitterlehner-966343a9 | — |
| 30 | Audrey | softgirlnocode | softgirlnocode | — | — |
| 31 | LeAnn Lai | leann.llx | leann.llx | le-ann-lai-73a96b21b | — |
| 32 | Olivia Cho | oliviacho_ | — | — | — |
| 33 | Bret Contreras | bretcontreras1 | gluteguy | — | — |
| 34 | Jay Ng | jay.junjie | — | jayngjunjie | — |

**Count check:** 34 IG | 13 TikTok | 17 LinkedIn | 2 Facebook ✅

---

## Scaling Strategy: 10-20 New Clients Per Month

### Growth Projections

| Month | Clients | Disk (cumulative) | Make.com Records/day | Apify cost (fallback) |
|-------|---------|-------------------|---------------------|-----------------------|
| 1 (now) | 34 | 0.4 GB | 35 | $1.64/mo |
| 3 | 64 | 1.9 GB | 65 | $3.10/mo |
| 6 | 109 | 5.5 GB | 110 | $5.30/mo |
| 9 | 154 | 10.8 GB | 155 | $7.50/mo |
| 12 | 199 | 17.8 GB | 200 | $10.40/mo |

### Trigger Points (when to act)

#### Make.com Data Store (URGENT — hits limit at 28 days!)

The "Social Intel — Snapshots" data store has:
- **Record limit: 1,000 records**
- **Size limit: 10 MB**
- At 34 clients = 35 records/day → **store full in 28 days**
- At 100 clients = 101 records/day → **store full in 9 days**

**Solution: Daily cleanup module**
Add a module to Scenario B that deletes records older than 7 days:
1. Data Store → Search Records (filter: scrapedAt older than 7 days ago)
2. Iterator → Data Store → Delete Record
3. This keeps the store under 250 records at 34 clients

**Alternative: Switch to date-keyed stores**
- Create a new data store per month: "Social Intel — 2026-04"
- Old months become read-only archives
- Scenario B rotates to the current month's store automatically

#### PC Disk Storage

| Threshold | Action |
|-----------|--------|
| **< 10 GB** (months 1-6) | No action. Current PC handles it fine. |
| **10-20 GB** (months 6-12) | Enable screenshot compression (reduce ~380 KB/day → ~100 KB). Add `--quality 60` to Playwright screenshots. |
| **20-50 GB** (months 12-18) | Prune snapshots older than 90 days. Keep `history.json` (tiny) + `metrics-latest.json` (overwritten). Delete dated snapshots/reports. |
| **50+ GB** (month 18+) | Time for VPS with proper storage, or move snapshots to cloud (Google Drive / S3). |

**Automated pruning script** (add to scraper as `--prune` flag):
```javascript
// Delete snapshot files older than 90 days
const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
// Walk data/{clientId}/snapshots/ and delete files with dates before cutoff
```

#### Apify Free Tier Budget

| Threshold | Action |
|-----------|--------|
| **< $5/mo** (up to ~80 clients) | Stay on free tier. Only burns credits on PC-miss days. |
| **$5-10/mo** (80-150 clients) | Upgrade to Apify Starter ($49/mo). OR: move to VPS (eliminates Apify need entirely). |
| **$10+/mo** (150+ clients) | VPS is now clearly cheaper. Hetzner CX22 at $8.70/mo replaces all API costs. |

#### SocialKit Budget

Should stay near $0/mo if the tiered fallback works correctly. Monitor via Make.com execution logs — if SocialKit calls spike, investigate which accounts are failing Graph API + Apify.

#### Make.com Operations

| Threshold | Action |
|-----------|--------|
| **< 50,000 ops/mo** (up to ~200 clients) | No action. Teams plan handles it. |
| **50,000-100,000 ops/mo** (200-400 clients) | Review scenario efficiency. Batch API calls where possible. |
| **100,000+ ops/mo** | Consider VPS for primary scraping to reduce Make.com load. |

### Monthly Monitoring Checklist

Run this check on the 1st of each month:

- [ ] **Data store records:** Go to Data Stores → "Social Intel — Snapshots" → check record count. If > 700, purge old records.
- [ ] **Apify credits:** Go to https://apify.com → Billing → check remaining credits. If < $1, reduce fallback frequency or upgrade.
- [ ] **SocialKit credits:** Check https://socialkit.dev dashboard. If burning credits, investigate which clients are failing free tiers.
- [ ] **Make.com ops:** Go to Organization → Usage. Check Social Intel scenarios specifically.
- [ ] **PC disk:** Run `du -sh social-intel/data/` — if > 5 GB, enable pruning.
- [ ] **Client count:** Update this guide's client list if new clients were added during the month.
- [ ] **Meta token expiry:** Long-lived tokens expire after 60 days. If using manual tokens, refresh before expiry.
- [ ] **Telegram alerts:** Review last 30 days of alerts. If fallback ran more than 10 times, consider VPS.

### Vectors & Embeddings Infrastructure

Currently using Azure OpenAI for embeddings (keys in `.env.local`):
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_EMBEDDING_KEY`

**Scaling considerations:**
| Clients | Embeddings/month (est.) | Azure cost |
|---------|------------------------|------------|
| 34 | ~5,000 (posts + bios) | < $1 |
| 100 | ~15,000 | ~$2 |
| 200 | ~30,000 | ~$4 |

Embedding costs are negligible. The real scaling concern is **Supabase** (vector store):
- Free tier: 500 MB database, 2 GB storage
- At ~200 clients with full embeddings: ~50-100 MB — well within free tier
- **Trigger point:** 500+ clients or if you start embedding full post content → upgrade to Supabase Pro ($25/mo)

### When to Move to VPS (Decision Framework)

```
IF any of these are true:
  ├── Monthly Apify bill > $10       → VPS saves money
  ├── PC fallback running > 15x/mo   → PC unreliable, need always-on
  ├── Client count > 100              → Scrape time exceeds PC availability
  ├── Paying clients > 5              → Revenue justifies $8.70/mo infra
  └── Need 24/7 competitor monitoring → Can't depend on PC uptime

THEN: Provision Hetzner CX22 (€7.99/mo)
  ├── Eliminates: Apify costs, SocialKit costs, Meta Graph API token management
  ├── Keeps: Make.com as heartbeat monitor only
  └── ROI: pays for itself in 1 month vs API costs at scale
```
