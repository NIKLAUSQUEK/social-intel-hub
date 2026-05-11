/**
 * Reddit API client — uses OAuth client_credentials (no user login required).
 *
 * Setup (5 min):
 *   1. https://www.reddit.com/prefs/apps → create app → "script"
 *   2. Get client_id (under app name) + secret
 *   3. Set in .env.local:
 *        REDDIT_CLIENT_ID=
 *        REDDIT_CLIENT_SECRET=
 *        REDDIT_USER_AGENT=social-intel/1.0 by /u/yourusername
 *
 * Free tier: 60 requests/minute. Plenty for trend research.
 */

let _accessToken = null;
let _tokenExpiresAt = 0;

async function getAccessToken() {
  if (_accessToken && Date.now() < _tokenExpiresAt - 60_000) return _accessToken;

  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) throw new Error('REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not set');

  const auth = Buffer.from(`${id}:${secret}`).toString('base64');
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': process.env.REDDIT_USER_AGENT || 'social-intel/1.0',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Reddit auth ${res.status}: ${await res.text()}`);
  const j = await res.json();
  _accessToken = j.access_token;
  _tokenExpiresAt = Date.now() + (j.expires_in || 3600) * 1000;
  return _accessToken;
}

async function get(path, params = {}) {
  const token = await getAccessToken();
  const url = new URL(`https://oauth.reddit.com${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': process.env.REDDIT_USER_AGENT || 'social-intel/1.0',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Reddit ${path} ${res.status}`);
  return res.json();
}

// ── Public methods ─────────────────────────────────

export async function searchPosts(query, opts = {}) {
  const data = await get('/search', {
    q: query,
    sort: opts.sort || 'hot',
    t: opts.timeframe || 'week',
    limit: opts.limit || 25,
    type: 'link',
  });
  return (data.data?.children || []).map(c => simplify(c.data));
}

export async function hotPosts(subreddit, opts = {}) {
  const data = await get(`/r/${subreddit}/hot`, { limit: opts.limit || 25 });
  return (data.data?.children || []).map(c => simplify(c.data));
}

export async function risingPosts(subreddit, opts = {}) {
  const data = await get(`/r/${subreddit}/rising`, { limit: opts.limit || 25 });
  return (data.data?.children || []).map(c => simplify(c.data));
}

/**
 * Find trending topics across multiple subs (good for trend-jacking).
 * Returns top posts ranked by upvote velocity + comment count.
 */
export async function findTrending(subreddits, opts = {}) {
  const all = [];
  for (const sub of subreddits) {
    try {
      const posts = await hotPosts(sub, { limit: opts.limitPerSub || 15 });
      all.push(...posts);
    } catch (err) {
      console.log(`  [reddit] r/${sub} failed: ${err.message}`);
    }
  }
  all.sort((a, b) => (b.upvoteRatio * b.score + b.numComments * 2) - (a.upvoteRatio * a.score + a.numComments * 2));
  return all.slice(0, opts.totalLimit || 30);
}

function simplify(d) {
  return {
    id: d.id,
    subreddit: d.subreddit,
    title: d.title,
    text: (d.selftext || '').slice(0, 1500),
    url: `https://www.reddit.com${d.permalink}`,
    externalUrl: d.url_overridden_by_dest || d.url,
    author: d.author,
    score: d.score || 0,
    upvoteRatio: d.upvote_ratio || 0,
    numComments: d.num_comments || 0,
    createdUtc: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
    isVideo: !!d.is_video,
    flair: d.link_flair_text,
  };
}
