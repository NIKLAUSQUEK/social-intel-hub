# Week 2 — OAuth Connectors Integration Plan

> **For:** TITAN.AI development team
> **Status:** Spec ready for implementation
> **Estimated effort:** 5 developer-days for one engineer, or 3 days for two

## Goal

Give each TITAN.AI client a self-serve **"Connect Account"** flow for Instagram, TikTok, and YouTube. Once connected, our system pulls **first-party analytics** (impressions, reach, watch-through, saves) via the official APIs — far more accurate than scraping and free of rate-limit / detection risk.

## Architecture (locked: Option 3 — reverse proxy)

```
                    ┌────────────────────────────────────────┐
                    │  titan-ai-research.vercel.app          │
                    │  (Python + Supabase Auth)              │
                    │                                         │
                    │  ┌─ /login, /dashboard (Python routes) │
                    │  │                                      │
                    │  └─ /intel/* ──┐ (vercel.json rewrite) │
                    └────────────────┼───────────────────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────────────┐
                    │  social-intel-hub.vercel.app           │
                    │  (Node + Express, this repo)           │
                    │                                         │
                    │  /intel/connections                     │
                    │  /intel/api/connections/*               │
                    │  /intel/api/clients/:id/sync            │
                    └────────────────────────────────────────┘

  Both share the SAME Supabase project for users + tokens.
```

## Prerequisites — one-time setup BEFORE coding

### 1. Supabase shared schema

In the existing Supabase project, run these migrations:

```sql
-- Per-tenant clients (one user can own many client brands)
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  slug text unique not null,            -- e.g. 'hae-claypot-sg'
  name text not null,
  niche text,
  active boolean default true,
  created_at timestamptz default now()
);

-- OAuth connections per platform per client
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade not null,
  platform text not null check (platform in ('instagram','tiktok','youtube','facebook','linkedin')),
  platform_user_id text not null,       -- IG business ID, TT open_id, YT channel ID
  platform_username text,
  access_token text not null,           -- encrypt at rest in prod
  refresh_token text,
  expires_at timestamptz,
  scopes text[],
  status text default 'active' check (status in ('active','revoked','expired','error')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (client_id, platform)
);

-- Audit log of sync attempts (informs the existing scrape-health UI)
create table public.sync_log (
  id bigserial primary key,
  connection_id uuid references public.connections(id) on delete cascade,
  started_at timestamptz default now(),
  finished_at timestamptz,
  status text check (status in ('success','partial','failed')),
  posts_fetched integer,
  error text
);

-- Row-level security — clients can ONLY see their own data
alter table public.clients enable row level security;
create policy "owner reads own clients" on public.clients
  for select using (auth.uid() = owner_id);
create policy "owner writes own clients" on public.clients
  for all using (auth.uid() = owner_id);

alter table public.connections enable row level security;
create policy "owner reads own connections" on public.connections
  for select using (
    client_id in (select id from public.clients where owner_id = auth.uid())
  );
create policy "owner writes own connections" on public.connections
  for all using (
    client_id in (select id from public.clients where owner_id = auth.uid())
  );

alter table public.sync_log enable row level security;
create policy "owner reads own sync_log" on public.sync_log
  for select using (
    connection_id in (
      select id from public.connections where client_id in (
        select id from public.clients where owner_id = auth.uid()
      )
    )
  );
```

Verify: `select * from clients` returns nothing when logged in as user A but rows exist for user B.

### 2. Platform app registrations

Each requires a one-time setup with the platform's developer console. Do these **before** the engineer starts so OAuth keys are ready.

#### Instagram (Meta for Developers)

1. Go to **developers.facebook.com → My Apps → Create App** → type **Business**
2. Add product: **Instagram Graph API**
3. Settings → Basic → grab **App ID** + **App Secret**
4. Use Cases → Add: `instagram_business_basic`, `instagram_business_manage_insights`, `instagram_business_manage_messages`, `instagram_business_content_publish`
5. App Roles → Add yourself as a tester
6. OAuth redirect URI: `https://titan-ai-research.vercel.app/intel/api/connections/instagram/callback`
7. App Review → required scopes need approval. Use **test users** until approved.

Env vars to store on Vercel:
```
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=https://titan-ai-research.vercel.app/intel/api/connections/instagram/callback
```

#### TikTok (TikTok for Developers)

1. **developers.tiktok.com → Manage apps → Create app**
2. Pick **Business** product if available, otherwise **Login Kit + Research API**
3. Permissions needed: `user.info.basic`, `video.list`, `video.insights` (`research.adlib.basic` if going further)
4. Redirect URI: `https://titan-ai-research.vercel.app/intel/api/connections/tiktok/callback`
5. Save **Client Key** + **Client Secret**

Env vars:
```
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=https://titan-ai-research.vercel.app/intel/api/connections/tiktok/callback
```

#### YouTube (Google Cloud Console)

1. **console.cloud.google.com → Create Project** → "TITAN Social Intel"
2. APIs & Services → Library → enable **YouTube Data API v3** and **YouTube Analytics API**
3. Credentials → Create credentials → **OAuth 2.0 Client ID** → type **Web application**
4. Authorized redirect URIs: `https://titan-ai-research.vercel.app/intel/api/connections/youtube/callback`
5. OAuth consent screen → External → add scopes: `youtube.readonly`, `yt-analytics.readonly`
6. Save **Client ID** + **Client Secret**

Env vars:
```
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REDIRECT_URI=https://titan-ai-research.vercel.app/intel/api/connections/youtube/callback
```

### 3. Add reverse proxy to Python app

In the Python app's `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/intel/(.*)", "destination": "https://social-intel-hub-niklauss-projects.vercel.app/$1" }
  ]
}
```

Or set up a FastAPI/Flask proxy route if `vercel.json` rewrites aren't an option in your framework.

---

## Tickets (5 sprints × 1 day each)

### Ticket 1 — Supabase JWT validation middleware
**Where:** `social-intel-hub/api/middleware/auth.js`
**Effort:** 0.5 day

Create middleware that validates the Supabase JWT cookie from the request, populates `req.user = { id, email }`. Gate all `/api/*` routes behind it.

```javascript
// api/middleware/auth.js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // server-side only
)

export async function requireAuth(req, res, next) {
  const token = req.cookies['sb-access-token'] ||
                req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return res.status(401).json({ error: 'Invalid token' })

  req.user = data.user
  next()
}
```

Add `cookie-parser` middleware. Mount on all sensitive routes:
```javascript
app.use('/api/clients', requireAuth, clientRoutes)
app.use('/api/connections', requireAuth, connectionRoutes)
```

**Env vars to add on Vercel:**
- `SUPABASE_URL=https://xxxxx.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=eyJhbG...` (from Supabase → Settings → API → **service_role** secret)

**Acceptance test:** unauth'd `curl /api/clients` → 401. Auth'd request (with valid JWT cookie) → list of clients.

---

### Ticket 2 — Connections list + Connect-button page
**Where:**
- Backend: `social-intel-hub/api/routes/connections.js` (new)
- Frontend: `social-intel-hub/dashboard/connections.html` (new) + nav link

**Effort:** 0.5 day

#### Backend routes (Express)

```javascript
// GET /api/connections?clientId=xxx — list connections for a client
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('connections')
    .select('*, clients!inner(owner_id)')
    .eq('clients.owner_id', req.user.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ connections: data })
})

// DELETE /api/connections/:id — disconnect
router.delete('/:id', requireAuth, async (req, res) => {
  // RLS will block if not owner
  const { error } = await supabase.from('connections').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})
```

#### Frontend (connections.html)

Simple table:

| Platform | Status | Connected as | Last sync | Actions |
|---|---|---|---|---|
| Instagram | 🟢 Connected | @haeclaypotsg | 5 May 22:00 | [Sync now] [Disconnect] |
| TikTok | ⚪ Not connected | — | — | [Connect TikTok →] |
| YouTube | 🔴 Token expired | UCxxxxx | 2 days ago | [Reconnect] |

Each "Connect X" button is a link to `/intel/api/connections/instagram/connect?clientId=xxx`.

---

### Ticket 3 — Instagram OAuth flow
**Where:** `social-intel-hub/api/routes/connections-instagram.js`
**Effort:** 1 day

```javascript
// GET /api/connections/instagram/connect?clientId=xxx
// → Redirects user to Meta OAuth consent screen
router.get('/instagram/connect', requireAuth, (req, res) => {
  const { clientId } = req.query
  const state = signState({ userId: req.user.id, clientId })  // HMAC-signed
  const url = new URL('https://www.facebook.com/v22.0/dialog/oauth')
  url.searchParams.set('client_id', process.env.META_APP_ID)
  url.searchParams.set('redirect_uri', process.env.META_REDIRECT_URI)
  url.searchParams.set('state', state)
  url.searchParams.set('scope', [
    'instagram_business_basic',
    'instagram_business_manage_insights',
    'pages_show_list',
    'pages_read_engagement',
  ].join(','))
  url.searchParams.set('response_type', 'code')
  res.redirect(url.toString())
})

// GET /api/connections/instagram/callback?code=...&state=...
router.get('/instagram/callback', async (req, res) => {
  const { code, state } = req.query
  const { userId, clientId } = verifyState(state)  // throws on tampering

  // 1. Exchange code → short-lived access token
  const tokenRes = await fetch('https://graph.facebook.com/v22.0/oauth/access_token?' + new URLSearchParams({
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    redirect_uri: process.env.META_REDIRECT_URI,
    code,
  }))
  const { access_token: shortToken } = await tokenRes.json()

  // 2. Upgrade to long-lived token (60 days)
  const longRes = await fetch(`https://graph.facebook.com/v22.0/oauth/access_token?` + new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    fb_exchange_token: shortToken,
  }))
  const { access_token: longToken, expires_in } = await longRes.json()

  // 3. Find linked IG Business account
  const pagesRes = await fetch(`https://graph.facebook.com/v22.0/me/accounts?access_token=${longToken}`)
  const pages = (await pagesRes.json()).data
  // For each page, find linked instagram_business_account
  let igBusiness = null
  for (const page of pages) {
    const r = await fetch(`https://graph.facebook.com/v22.0/${page.id}?fields=instagram_business_account{id,username}&access_token=${longToken}`)
    const j = await r.json()
    if (j.instagram_business_account) {
      igBusiness = { ...j.instagram_business_account, pageToken: page.access_token }
      break
    }
  }
  if (!igBusiness) {
    return res.redirect('/intel/connections?error=no_business_account')
  }

  // 4. Save to Supabase
  await supabase.from('connections').upsert({
    client_id: clientId,
    platform: 'instagram',
    platform_user_id: igBusiness.id,
    platform_username: igBusiness.username,
    access_token: igBusiness.pageToken,  // Page token, not user token, for IG insights
    expires_at: new Date(Date.now() + expires_in * 1000),
    scopes: ['instagram_business_basic', 'instagram_business_manage_insights'],
    status: 'active',
  }, { onConflict: 'client_id,platform' })

  res.redirect('/intel/connections?success=instagram')
})
```

**HMAC state helper** (prevents CSRF on the callback):
```javascript
import crypto from 'crypto'
function signState(obj) {
  const payload = Buffer.from(JSON.stringify(obj)).toString('base64url')
  const sig = crypto.createHmac('sha256', process.env.STATE_SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}
function verifyState(s) {
  const [payload, sig] = s.split('.')
  const expected = crypto.createHmac('sha256', process.env.STATE_SECRET).update(payload).digest('base64url')
  if (sig !== expected) throw new Error('Invalid state')
  return JSON.parse(Buffer.from(payload, 'base64url').toString())
}
```

**Acceptance test:**
1. Click "Connect Instagram" → redirected to Meta
2. Approve → land back on `/intel/connections?success=instagram`
3. Connection row exists in Supabase with valid `access_token` and `expires_at` ~60 days out

---

### Ticket 4 — TikTok OAuth flow
**Where:** `social-intel-hub/api/routes/connections-tiktok.js`
**Effort:** 1 day

Same pattern as Instagram. Differences:
- Auth URL: `https://www.tiktok.com/v2/auth/authorize/`
- Token URL: `https://open.tiktokapis.com/v2/oauth/token/`
- Scopes: `user.info.basic,video.list,video.insights`
- Token lifetime: 24 hours access, 365 days refresh
- Refresh required every day → Make.com scenario handles it

Reference: https://developers.tiktok.com/doc/login-kit-web/

**Acceptance test:** click "Connect TikTok" → consent → row in Supabase with `refresh_token` populated.

---

### Ticket 5 — YouTube OAuth flow + "Sync now" stub
**Where:**
- `social-intel-hub/api/routes/connections-youtube.js`
- `social-intel-hub/api/routes/connections.js` add `POST /:id/sync`

**Effort:** 1 day

YouTube uses standard Google OAuth 2.0:
- Auth URL: `https://accounts.google.com/o/oauth2/v2/auth`
- Token URL: `https://oauth2.googleapis.com/token`
- Scopes: `https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly`
- `access_type=offline&prompt=consent` to get refresh token

**Sync stub** — leave the actual data pulling for Week 3, but build the endpoint scaffold:

```javascript
// POST /api/connections/:id/sync — manually trigger a sync
router.post('/:id/sync', requireAuth, async (req, res) => {
  const { data: conn } = await supabase.from('connections').select('*').eq('id', req.params.id).single()
  if (!conn) return res.status(404).json({ error: 'Connection not found' })

  const syncId = await startSyncLog(conn.id)
  // Week 3: actual pull logic per platform
  res.json({ ok: true, syncId, message: 'Sync queued (Week 3 will execute it)' })
})
```

---

### Ticket 6 — Token refresh worker on Make.com
**Where:** Make.com scenario
**Effort:** 0.5 day

Build one Make scenario:
1. **Trigger:** every 50 minutes
2. **Action 1:** HTTP GET to `https://social-intel-hub.../api/internal/connections-expiring?within=10min` (returns rows where `expires_at < now + 10min`, requires `INTERNAL_API_KEY` header)
3. **Iterator:** for each row, route by `platform`
4. **HTTP POST** to platform's token refresh endpoint with `refresh_token`
5. **HTTP POST** back to `/api/internal/connections/:id/refresh-token` with new tokens

Add the internal endpoints in social-intel-hub:

```javascript
// Requires INTERNAL_API_KEY header — NOT user JWT
router.get('/internal/connections-expiring', requireInternalKey, async (req, res) => {
  const within = parseInt(req.query.within) || 10
  const cutoff = new Date(Date.now() + within * 60000)
  const { data } = await supabase.from('connections')
    .select('*').lt('expires_at', cutoff.toISOString()).eq('status', 'active')
  res.json({ connections: data })
})

router.post('/internal/connections/:id/refresh-token', requireInternalKey, async (req, res) => {
  const { access_token, refresh_token, expires_at } = req.body
  await supabase.from('connections').update({
    access_token, refresh_token: refresh_token || undefined, expires_at,
    updated_at: new Date(),
  }).eq('id', req.params.id)
  res.json({ ok: true })
})
```

Env var: `INTERNAL_API_KEY=` (random 32-char string, also in Make.com headers)

---

## Security checklist (must do before going live)

- [ ] All env vars marked **Sensitive** in Vercel UI (hides from logs)
- [ ] Supabase service-role key is on Vercel only, never in client-side code
- [ ] `access_token` column in `connections` should be encrypted at rest — use `pgsodium` or Supabase Vault
- [ ] `STATE_SECRET` is a 32+ char random string, different per environment
- [ ] All OAuth callbacks verify HMAC `state` parameter
- [ ] RLS policies tested with two different users — confirm user A cannot read user B's connections
- [ ] Rate limit `/api/connections/*/connect` to 5/min per user (prevent OAuth flood)
- [ ] On disconnect, also call the platform's token revoke endpoint
- [ ] Never log access/refresh tokens

## Acceptance checklist (whole Phase 2)

- [ ] User logs into Python app, clicks "Social Intel" → lands on `/intel/connections`
- [ ] User adds a client brand (e.g. "Hae Claypot")
- [ ] Clicks "Connect Instagram" → completes OAuth → connection row exists in Supabase
- [ ] Clicks "Connect TikTok" → same
- [ ] Clicks "Connect YouTube" → same
- [ ] Logs out, logs in as different user → cannot see first user's connections
- [ ] Clicks "Disconnect" → row deleted, token revoked at platform
- [ ] Make.com refresh worker successfully refreshes a token 10 minutes before expiry

## What Week 3 picks up

- Implement actual data pull per platform inside `POST /api/connections/:id/sync`
- Write incoming posts to existing `data/{client}/posts-latest.json` structure (so existing dashboards work unchanged)
- Trigger classifier inline after each sync
- Schedule daily auto-sync via Make.com

## Cost reality check

- Supabase: free tier covers ~500MB DB + 2GB egress — fine for tokens + connections + sync_log
- Meta API: free for our usage volume
- TikTok API: free, rate-limited per app (plenty)
- YouTube Data API: 10K quota units/day free — one sync ≈ 50 units, supports ~200 clients/day
- Make.com: free tier 1K ops/mo. Refresh worker uses ~30 ops/day = 900/mo. Tight. Suggest the $9 plan.

## Open questions for the engineer to clarify with you before starting

1. Do you want a "team" concept (one user owns multiple clients, can invite collaborators) or strictly one-user-one-account?
2. What happens if a client already has an Instagram connection in Supabase and the user re-runs OAuth — overwrite or block?
3. Are you OK with using Make.com for token refresh, or would you rather run a Vercel cron job?
4. Encryption-at-rest for tokens — must-have or nice-to-have for v1?
