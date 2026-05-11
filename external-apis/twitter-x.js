/**
 * Twitter / X scraper — Twikit-equivalent for Node.
 *
 * Three implementation paths supported (auto-detected):
 *
 *   A) `agent-twitter-client` npm package (recommended, JS-native, no Python dependency)
 *      Setup:
 *        npm install agent-twitter-client
 *        Set in .env.local:
 *          TWITTER_USERNAME=
 *          TWITTER_PASSWORD=
 *          TWITTER_EMAIL=                    (optional, used if 2FA challenge appears)
 *
 *   B) Local Twikit server (Python, fallback)
 *      Set TWIKIT_SERVER_URL=http://localhost:8000 (you run twikit-server separately)
 *
 *   C) RapidAPI Twitter endpoint (paid, most reliable)
 *      Set RAPIDAPI_TWITTER_KEY + RAPIDAPI_TWITTER_HOST
 *
 * The wrapper tries A → B → C in that order.
 */

let _scraper = null;
let _scraperReady = false;

async function getAgentScraper() {
  if (_scraperReady) return _scraper;
  if (!process.env.TWITTER_USERNAME) return null;

  try {
    const { Scraper } = await import('agent-twitter-client');
    _scraper = new Scraper();
    await _scraper.login(
      process.env.TWITTER_USERNAME,
      process.env.TWITTER_PASSWORD,
      process.env.TWITTER_EMAIL,
    );
    _scraperReady = true;
    return _scraper;
  } catch (err) {
    console.log(`  [twitter-x] agent-twitter-client unavailable: ${err.message?.slice(0, 100)}`);
    return null;
  }
}

async function viaTwikitServer(path, params = {}) {
  const base = process.env.TWIKIT_SERVER_URL;
  if (!base) return null;
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Twikit server ${res.status}`);
  return res.json();
}

async function viaRapidAPI(endpoint, params) {
  const key = process.env.RAPIDAPI_TWITTER_KEY;
  const host = process.env.RAPIDAPI_TWITTER_HOST;
  if (!key || !host) return null;
  const url = new URL(`https://${host}${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': host },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`RapidAPI Twitter ${res.status}`);
  return res.json();
}

// ── Public API ─────────────────────────────────────

/**
 * Search for tweets matching a query.
 * Returns array of { id, text, author, createdAt, likes, retweets, replies, url }.
 */
export async function searchTweets(query, opts = {}) {
  const limit = opts.limit || 30;

  // Path A: agent-twitter-client
  try {
    const s = await getAgentScraper();
    if (s) {
      const results = [];
      for await (const t of s.searchTweets(query, limit, 'Latest')) {
        results.push(simplifyAgentTweet(t));
        if (results.length >= limit) break;
      }
      return results;
    }
  } catch (err) {
    console.log(`  [twitter-x] agent search failed: ${err.message?.slice(0,80)}`);
  }

  // Path B: Twikit server
  try {
    const data = await viaTwikitServer('/search', { q: query, count: limit });
    if (data) return (data.tweets || []).map(simplifyTwikit);
  } catch {}

  // Path C: RapidAPI
  try {
    const data = await viaRapidAPI('/search', { query, count: limit });
    if (data) return (data.tweets || []).map(simplifyRapid);
  } catch {}

  throw new Error('No Twitter scraper available — set TWITTER_USERNAME or TWIKIT_SERVER_URL or RAPIDAPI_TWITTER_*');
}

/**
 * Get a user's recent tweets.
 */
export async function getUserTweets(handle, opts = {}) {
  const limit = opts.limit || 30;
  const cleanHandle = handle.replace(/^@/, '');

  try {
    const s = await getAgentScraper();
    if (s) {
      const results = [];
      for await (const t of s.getTweets(cleanHandle, limit)) {
        results.push(simplifyAgentTweet(t));
        if (results.length >= limit) break;
      }
      return results;
    }
  } catch (err) {
    console.log(`  [twitter-x] agent user tweets failed: ${err.message?.slice(0,80)}`);
  }

  try {
    const data = await viaTwikitServer(`/user/${cleanHandle}/tweets`, { count: limit });
    if (data) return (data.tweets || []).map(simplifyTwikit);
  } catch {}

  throw new Error('No Twitter scraper available');
}

/**
 * Find trending topics on X — useful for trend-jacking.
 */
export async function getTrending(woeid = 1) {
  // 'agent-twitter-client' supports trending — fall through if not
  try {
    const s = await getAgentScraper();
    if (s && typeof s.getTrending === 'function') {
      return await s.getTrending(woeid);
    }
  } catch {}

  try {
    const data = await viaTwikitServer('/trending', { woeid });
    if (data) return data.trending || [];
  } catch {}

  return [];
}

// ── Normalisers ────────────────────────────────────

function simplifyAgentTweet(t) {
  return {
    id: t.id,
    text: t.text || '',
    author: t.username || t.userId,
    authorName: t.name,
    createdAt: t.timeParsed || t.timestamp,
    likes: t.likes || 0,
    retweets: t.retweets || 0,
    replies: t.replies || 0,
    views: t.views || 0,
    url: t.permanentUrl,
    isRetweet: !!t.isRetweet,
    isReply: !!t.isReply,
    hashtags: t.hashtags || [],
    mentions: t.mentions || [],
    urls: t.urls || [],
  };
}

function simplifyTwikit(t) {
  return {
    id: t.id || t.id_str,
    text: t.text || t.full_text || '',
    author: t.user?.screen_name,
    authorName: t.user?.name,
    createdAt: t.created_at,
    likes: t.favorite_count || 0,
    retweets: t.retweet_count || 0,
    replies: t.reply_count || 0,
    url: t.user?.screen_name ? `https://x.com/${t.user.screen_name}/status/${t.id}` : null,
  };
}

function simplifyRapid(t) {
  return {
    id: t.id || t.tweet_id,
    text: t.text || t.full_text || '',
    author: t.user?.screen_name || t.username,
    authorName: t.user?.name,
    createdAt: t.created_at,
    likes: t.favorite_count || t.likes || 0,
    retweets: t.retweet_count || t.retweets || 0,
    replies: t.reply_count || t.replies || 0,
    url: t.url,
  };
}
